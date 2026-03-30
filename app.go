package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

type StudyLog struct {
	Name    string `json:"name"`
	Seconds int    `json:"seconds"`
}

// GetRepoUrl returns the current git remote url from ~/.study-logs
func (a *App) GetRepoUrl() string {
	logDir := filepath.Join(os.Getenv("HOME"), ".study-logs")
	if _, err := os.Stat(logDir); os.IsNotExist(err) {
		return ""
	}
	cmd := exec.Command("git", "config", "--get", "remote.origin.url")
	cmd.Dir = logDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// SetRepoUrl configures the remote repository url
func (a *App) SetRepoUrl(url string) error {
	logDir := filepath.Join(os.Getenv("HOME"), ".study-logs")
	if _, err := os.Stat(logDir); os.IsNotExist(err) {
		if err := os.MkdirAll(logDir, 0755); err != nil {
			return fmt.Errorf("failed to create log directory: %v", err)
		}
	}
	
	// Initialize git if not already
	if _, err := os.Stat(filepath.Join(logDir, ".git")); os.IsNotExist(err) {
		if err := runGitCommand(logDir, "init"); err != nil {
			return fmt.Errorf("failed to git init: %v", err)
		}
	}

	// Check if origin exists
	cmd := exec.Command("git", "remote")
	cmd.Dir = logDir
	out, _ := cmd.CombinedOutput()
	if strings.Contains(string(out), "origin") {
		return runGitCommand(logDir, "remote", "set-url", "origin", url)
	}
	return runGitCommand(logDir, "remote", "add", "origin", url)
}

// CommitStudyLogs handles saving the study logs to markdown and pushes to git
func (a *App) CommitStudyLogs(logs []StudyLog) (string, error) {
	logDir := filepath.Join(os.Getenv("HOME"), ".study-logs")
	
	// Check if git is initialized and has a remote
	if a.GetRepoUrl() == "" {
		return "", fmt.Errorf("please configure a GitHub repository URL first")
	}

	if len(logs) == 0 {
		return "", fmt.Errorf("no logs to commit")
	}

	var totalSeconds int
	var messageParts []string

	for _, log := range logs {
		totalSeconds += log.Seconds
		part := fmt.Sprintf("%s : %s", log.Name, formatTime(log.Seconds))
		messageParts = append(messageParts, part)
	}

	totalTimeStr := formatTime(totalSeconds)
	commitMessage := fmt.Sprintf("%s Total %s studied", strings.Join(messageParts, " "), totalTimeStr)

	// Log directory
	if _, err := os.Stat(logDir); os.IsNotExist(err) {
		err := os.MkdirAll(logDir, 0755)
		if err != nil {
			return "", fmt.Errorf("failed to create log directory: %v", err)
		}
	}

	historyFile := filepath.Join(logDir, "history.md")
	
	// Create markdown content
	logLine := fmt.Sprintf("## %s\n- %s\n\n", time.Now().Format("2006-01-02 15:04:05"), commitMessage)

	f, err := os.OpenFile(historyFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to open history file: %v", err)
	}
	defer f.Close()

	if _, err := f.WriteString(logLine); err != nil {
		return "", fmt.Errorf("failed to write to history file: %v", err)
	}

	// Git commands
	if err := runGitCommand(logDir, "add", "."); err != nil {
		return "", fmt.Errorf("git add failed: %v", err)
	}

	if err := runGitCommand(logDir, "commit", "-m", commitMessage); err != nil {
		if !strings.Contains(err.Error(), "nothing to commit") {
			return "", fmt.Errorf("git commit failed: %v", err)
		}
	}

	_ = runGitCommand(logDir, "branch", "-M", "main")
    
	// Try pulling first to avoid non-fast-forward if repo has remote changes
	_ = runGitCommand(logDir, "pull", "--rebase", "origin", "main", "--allow-unrelated-histories")

	if err := runGitCommand(logDir, "push", "-u", "origin", "main"); err != nil {
		return "", fmt.Errorf("git push origin main failed: %v", err)
	}

	return commitMessage, nil
}

func formatTime(seconds int) string {
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	if h > 0 {
		return fmt.Sprintf("%d hours %d minutes", h, m)
	} else if m > 0 {
		return fmt.Sprintf("%d minutes %d seconds", m, s)
	}
	return fmt.Sprintf("%d seconds", s)
}

func runGitCommand(dir string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s - %v", string(out), err)
	}
	return nil
}
