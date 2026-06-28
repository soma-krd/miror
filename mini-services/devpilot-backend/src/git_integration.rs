// Git integration — shell out to `git` for per-project status, branch, recent commits.
// Every dev workspace tool should show git context without requiring a terminal switch.

use std::path::Path;
use anyhow::{Result, anyhow};
use tokio::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: String,
    pub is_dirty: bool,
    pub ahead: u32,
    pub behind: u32,
    pub staged: u32,
    pub unstaged: u32,
    pub untracked: u32,
    pub recent_commits: Vec<GitCommit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

pub async fn get_git_status(project_root: &str) -> Result<GitStatus> {
    let root = Path::new(project_root);
    if !root.exists() {
        return Ok(GitStatus {
            is_repo: false, branch: String::new(), is_dirty: false,
            ahead: 0, behind: 0, staged: 0, unstaged: 0, untracked: 0,
            recent_commits: vec![],
        });
    }

    // Check if it's a git repo
    let rev_parse = Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(root)
        .output().await;
    let is_repo = matches!(rev_parse, Ok(o) if o.status.success());

    if !is_repo {
        return Ok(GitStatus {
            is_repo: false, branch: String::new(), is_dirty: false,
            ahead: 0, behind: 0, staged: 0, unstaged: 0, untracked: 0,
            recent_commits: vec![],
        });
    }

    // Branch
    let branch = git_output(root, &["branch", "--show-current"]).await
        .unwrap_or_default().trim().to_string();

    // Porcelain status for counts
    let porcelain = git_output(root, &["status", "--porcelain=v2", "--branch"]).await
        .unwrap_or_default();

    let mut ahead = 0u32;
    let mut behind = 0u32;
    let mut staged = 0u32;
    let mut unstaged = 0u32;
    let mut untracked = 0u32;

    for line in porcelain.lines() {
        if line.starts_with("# branch.ab ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                ahead = parts[2].trim_start_matches('+').parse().unwrap_or(0);
                behind = parts[3].trim_start_matches('-').parse().unwrap_or(0);
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            // Changed entry — field 2 is XY status
            let xy = line.split_whitespace().nth(1).unwrap_or("");
            if !xy.starts_with('.') { staged += 1; }
            if !xy.ends_with('.') { unstaged += 1; }
        } else if line.starts_with("u ") {
            unstaged += 1; // unmerged
        } else if line.starts_with("? ") {
            untracked += 1;
        }
    }

    let is_dirty = staged > 0 || unstaged > 0 || untracked > 0;

    // Recent commits
    let log_output = git_output(root, &["log", "--oneline", "--format=%H%x1f%s%x1f%an%x1f%cr", "-10"]).await
        .unwrap_or_default();
    let recent_commits: Vec<GitCommit> = log_output.lines().filter_map(|line| {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() >= 4 {
            Some(GitCommit {
                hash: parts[0].to_string(),
                message: parts[1].to_string(),
                author: parts[2].to_string(),
                date: parts[3].to_string(),
            })
        } else { None }
    }).collect();

    Ok(GitStatus {
        is_repo: true, branch, is_dirty, ahead, behind,
        staged, unstaged, untracked, recent_commits,
    })
}

// --- Extended Git operations (Feature 3: Git sidebar view) -----------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub last_commit: String,
    pub last_commit_date: String,
}

pub async fn list_branches(project_root: &str) -> Result<Vec<GitBranch>> {
    let root = Path::new(project_root);
    let output = git_output(root, &["branch", "-a", "--format=%(HEAD)%00%(refname:short)%00%(objectname:short)%00%(committerdate:relative)"]).await?;
    let mut branches = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split('\0').collect();
        if parts.len() < 4 { continue; }
        let is_current = parts[0] == "*";
        let name = parts[1].to_string();
        let is_remote = name.starts_with("remotes/");
        let last_commit = parts[2].to_string();
        let last_commit_date = parts[3].to_string();
        branches.push(GitBranch { name, is_current, is_remote, last_commit, last_commit_date });
    }
    Ok(branches)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub refs: String,
}

pub async fn git_log(project_root: &str, count: usize) -> Result<Vec<GitLogEntry>> {
    let root = Path::new(project_root);
    let count_str = format!("-{}", count);
    let output = git_output(root, &["log", "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%cr%x1f%d", &count_str]).await?;
    let mut entries = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() >= 7 {
            entries.push(GitLogEntry {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                message: parts[2].to_string(),
                author: parts[3].to_string(),
                email: parts[4].to_string(),
                date: parts[5].to_string(),
                refs: parts[6].trim().to_string(),
            });
        }
    }
    Ok(entries)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitTreeEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub parents: Vec<String>,
    pub is_merge: bool,
}

pub async fn git_tree(project_root: &str, count: usize) -> Result<Vec<GitTreeEntry>> {
    let root = Path::new(project_root);
    let count_str = format!("-{}", count);
    // Graph-friendly format with parent info
    let output = git_output(root, &["log", "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%cr%x1f%P", &count_str]).await?;
    let mut entries = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() >= 6 {
            let parents: Vec<String> = parts[5].split_whitespace().map(|s| s.to_string()).collect();
            let is_merge = parents.len() > 1;
            entries.push(GitTreeEntry {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                message: parts[2].to_string(),
                author: parts[3].to_string(),
                date: parts[4].to_string(),
                parents,
                is_merge,
            });
        }
    }
    Ok(entries)
}

pub async fn git_push(project_root: &str) -> Result<String> {
    let root = Path::new(project_root);
    git_output(root, &["push"]).await
}

pub async fn git_pull(project_root: &str) -> Result<String> {
    let root = Path::new(project_root);
    git_output(root, &["pull"]).await
}

pub async fn git_checkout(project_root: &str, branch: &str) -> Result<String> {
    let root = Path::new(project_root);
    git_output(root, &["checkout", branch]).await
}

pub async fn git_command(project_root: &str, args: &[&str]) -> Result<String> {
    let root = Path::new(project_root);
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output().await?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        // Return stderr as the "result" so the UI can show it
        Ok(format!("{}\n{}", stdout, stderr))
    }
}

async fn git_output(cwd: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output().await?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(anyhow!("git {} failed: {}", args.join(" "), String::from_utf8_lossy(&output.stderr)))
    }
}
