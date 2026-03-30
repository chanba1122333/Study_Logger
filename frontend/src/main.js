let tasks = [];

const timeFormat = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const renderTasks = () => {
    const container = document.getElementById('tasks-container');
    container.innerHTML = '';
    
    tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';
        
        let controlsHTML = '';
        if (!task.isRunning) {
            controlsHTML += `<button class="control-btn btn-start" onclick="window.startTimer('${task.id}')">Start</button>`;
        } else {
            controlsHTML += `<button class="control-btn btn-pause" onclick="window.pauseTimer('${task.id}')">Pause</button>`;
        }
        
        card.innerHTML = `
            <button class="delete-task-btn" onclick="window.confirmDeleteTask('${task.id}')">✕</button>
            <div class="task-header">
                <div class="task-name">${task.name}</div>
            </div>
            <div class="task-timer" id="timer-${task.id}">${timeFormat(task.seconds)}</div>
            <div class="task-controls">
                ${controlsHTML}
            </div>
        `;
        
        container.appendChild(card);
    });
};

window.startTimer = (id) => {
    const task = tasks.find(t => t.id === id);
    if (task && !task.isRunning && !task.isStopped) {
        task.isRunning = true;
        task.lastTick = Date.now();
        task.interval = setInterval(() => {
            const now = Date.now();
            const delta = (now - task.lastTick) / 1000;
            task.seconds += delta;
            task.lastTick = now;
            document.getElementById(`timer-${id}`).innerText = timeFormat(Math.floor(task.seconds));
        }, 1000);
        renderTasks();
    }
};

window.pauseTimer = (id) => {
    const task = tasks.find(t => t.id === id);
    if (task && task.isRunning) {
        task.isRunning = false;
        clearInterval(task.interval);
        renderTasks();
    }
};

let taskToDelete = null;

window.confirmDeleteTask = (id) => {
    const skipConfirm = sessionStorage.getItem('skipDeleteConfirm') === 'true';
    if (skipConfirm) {
        window.deleteTask(id);
    } else {
        taskToDelete = id;
        document.getElementById('delete-modal').style.display = 'flex';
    }
};

document.getElementById('cancel-delete-btn').addEventListener('click', () => {
    taskToDelete = null;
    document.getElementById('delete-modal').style.display = 'none';
});

document.getElementById('confirm-delete-btn').addEventListener('click', () => {
    const dontAskAgain = document.getElementById('dont-ask-delete').checked;
    if (dontAskAgain) {
        sessionStorage.setItem('skipDeleteConfirm', 'true');
    }
    
    if (taskToDelete) {
        window.deleteTask(taskToDelete);
        taskToDelete = null;
    }
    document.getElementById('delete-modal').style.display = 'none';
});

window.deleteTask = (id) => {
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex > -1) {
        if (tasks[taskIndex].isRunning) {
            clearInterval(tasks[taskIndex].interval);
        }
        tasks.splice(taskIndex, 1);
        renderTasks();
    }
};

document.getElementById('add-task-btn').addEventListener('click', () => {
    const input = document.getElementById('new-task-input');
    const val = input.value.trim();
    if (val) {
        tasks.push({
            id: Date.now().toString(),
            name: val,
            seconds: 0,
            isRunning: false,
            interval: null
        });
        input.value = '';
        renderTasks();
    }
});

document.getElementById('new-task-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('add-task-btn').click();
    }
});

document.getElementById('commit-btn').addEventListener('click', async () => {
    tasks.forEach(t => {
        if (t.isRunning) window.pauseTimer(t.id);
    });
    renderTasks();
    
    // Convert logic to seconds, but only for tasks that actually gained time.
    const logs = tasks.map(t => {
        return { name: t.name, seconds: Math.floor(t.seconds) }; 
    }).filter(t => t.seconds > 0);

    if (logs.length === 0) {
        showCommitModal("No Data", "No study logs to commit! Spend at least some time studying first (e.g. 10 seconds).", true);
        return;
    }

    const btn = document.getElementById('commit-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Committing...';
    btn.classList.add('loading');

    try {
        if (window.go && window.go.main && window.go.main.App && window.go.main.App.CommitStudyLogs) {
            const resultMsg = await window.go.main.App.CommitStudyLogs(logs);
            showCommitModal("Success!", "Committed carefully to GitHub:\n\n" + resultMsg, false);
            tasks = [];
            renderTasks();
        } else {
            showCommitModal("Error", "Wails backend not connected. Restart wails dev server.", true);
        }
    } catch (e) {
        console.error(e);
        showCommitModal("Commit Failed", e.toString(), true);
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = originalText;
    }
});

const showCommitModal = (title, message, isError) => {
    document.getElementById('commit-modal').style.display = 'flex';
    document.getElementById('commit-modal-title').innerText = title;
    document.getElementById('commit-modal-msg').innerText = message;
    
    if (isError) {
        document.getElementById('commit-modal-title').style.color = 'var(--danger)';
        document.getElementById('commit-cancel-btn').style.display = 'block';
        document.getElementById('commit-retry-btn').style.display = 'block';
        document.getElementById('commit-ok-btn').style.display = 'none';
    } else {
        document.getElementById('commit-modal-title').style.color = 'var(--success)';
        document.getElementById('commit-cancel-btn').style.display = 'none';
        document.getElementById('commit-retry-btn').style.display = 'none';
        document.getElementById('commit-ok-btn').style.display = 'block';
    }
};

document.getElementById('commit-cancel-btn').addEventListener('click', () => {
    document.getElementById('commit-modal').style.display = 'none';
});
document.getElementById('commit-ok-btn').addEventListener('click', () => {
    document.getElementById('commit-modal').style.display = 'none';
});
document.getElementById('commit-retry-btn').addEventListener('click', () => {
    document.getElementById('commit-modal').style.display = 'none';
    document.getElementById('commit-btn').click();
});

const initRepoData = async () => {
    try {
        if (window.go && window.go.main && window.go.main.App && window.go.main.App.GetRepoUrl) {
            const url = await window.go.main.App.GetRepoUrl();
            const textEl = document.getElementById('current-repo-text');
            if (url) {
                textEl.innerText = 'Linked: ' + url;
                textEl.style.color = 'var(--text-primary)';
            } else {
                textEl.innerText = 'Not linked to GitHub yet';
                textEl.style.color = 'var(--danger)';
            }
        }
    } catch(e) { console.error(e) }
};

document.getElementById('edit-repo-btn').addEventListener('click', () => {
    const form = document.getElementById('repo-edit-form');
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
});

document.getElementById('save-repo-btn').addEventListener('click', async () => {
    const input = document.getElementById('repo-url-input');
    const val = input.value.trim();
    if (!val) {
        alert("Please enter a valid git URL");
        return;
    }
    const btn = document.getElementById('save-repo-btn');
    btn.innerText = 'Linking...';
    try {
        if (window.go && window.go.main && window.go.main.App && window.go.main.App.SetRepoUrl) {
            await window.go.main.App.SetRepoUrl(val);
            alert("Repository linked successfully!");
            document.getElementById('repo-edit-form').style.display = 'none';
            initRepoData();
        } else {
            const appMethods = window.go && window.go.main && window.go.main.App ? Object.keys(window.go.main.App) : [];
            alert("Wails function not found. Found methods: " + appMethods.join(", ") + ". Please restart wails dev server.");
        }
    } catch(e) {
        alert("Failed to set repo:\n" + e);
    } finally {
        btn.innerText = 'Link';
    }
});

setTimeout(initRepoData, 500);
