const { ipcRenderer } = require('electron');

class MiniTimerApp {
    constructor() {
        this.timer = null;
        this.timeLeft = 25 * 60; // 25分钟
        this.isRunning = false;
        this.isPaused = false;
        this.currentPhase = 'work'; // work, shortBreak, longBreak
        this.sessionCount = 0;
        this.progressRing = null;
        this.data = null;

        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.setupProgressRing();
        this.updateDisplay();
        this.updatePhaseDisplay();
        this.syncWithMainApp();
    }

    async loadData() {
        try {
            this.data = await ipcRenderer.invoke('get-data');
            if (!this.data) {
                this.data = {
                    settings: {
                        pomodoroTime: 25,
                        shortBreakTime: 5,
                        longBreakTime: 15,
                        longBreakInterval: 4,
                        soundEnabled: true,
                        notificationEnabled: true
                    },
                    sessions: [],
                    projects: [],
                    timeEntries: []
                };
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    }

    setupEventListeners() {
        // 按钮事件
        document.getElementById('mini-start').addEventListener('click', (e) => {
            e.stopPropagation();
            this.startTimer();
        });

        document.getElementById('mini-pause').addEventListener('click', (e) => {
            e.stopPropagation();
            this.pauseTimer();
        });

        document.getElementById('mini-skip').addEventListener('click', (e) => {
            e.stopPropagation();
            this.skipSession();
        });

        document.getElementById('mini-expand').addEventListener('click', (e) => {
            e.stopPropagation();
            this.expandToMain();
        });

        // 小球点击事件（开始/暂停）
        document.getElementById('mini-ball').addEventListener('click', (e) => {
            if (e.target.closest('.mini-controls')) return;
            
            if (!this.isRunning && !this.isPaused) {
                this.startTimer();
            } else if (this.isRunning) {
                this.pauseTimer();
            } else if (this.isPaused) {
                this.startTimer();
            }
        });

        // 右键菜单
        document.getElementById('mini-ball').addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e.clientX, e.clientY);
        });

        // 菜单项点击
        document.querySelectorAll('.mini-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleMenuAction(action);
                this.hideContextMenu();
            });
        });

        // 点击其他地方隐藏菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.mini-context-menu')) {
                this.hideContextMenu();
            }
        });

        // 双击展开
        document.getElementById('mini-ball').addEventListener('dblclick', () => {
            this.expandToMain();
        });

        // IPC 消息监听
        ipcRenderer.on('start-pomodoro', () => {
            this.startTimer();
        });

        ipcRenderer.on('toggle-pause', () => {
            this.pauseTimer();
        });

        ipcRenderer.on('skip-current', () => {
            this.skipSession();
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (!this.isRunning) {
                    this.startTimer();
                } else {
                    this.pauseTimer();
                }
            } else if (e.code === 'Escape') {
                this.expandToMain();
            }
        });

        // 防止拖拽时的默认行为
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });
    }

    setupProgressRing() {
        this.progressRing = document.querySelector('.mini-progress-bar');
        const radius = 55;
        const circumference = radius * 2 * Math.PI;
        
        this.progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
        this.progressRing.style.strokeDashoffset = circumference;
    }

    startTimer() {
        if (this.isPaused) {
            this.isPaused = false;
        } else {
            this.timeLeft = this.getPhaseTime() * 60;
        }
        
        this.isRunning = true;
        this.updateButtons();
        this.updateBallState();
        
        this.timer = setInterval(() => {
            this.timeLeft--;
            this.updateDisplay();
            this.updateProgress();
            
            if (this.timeLeft <= 0) {
                this.completeSession();
            }
        }, 1000);
    }

    pauseTimer() {
        if (this.isRunning) {
            this.isRunning = false;
            this.isPaused = true;
            clearInterval(this.timer);
        } else if (this.isPaused) {
            this.startTimer();
            return;
        }
        this.updateButtons();
        this.updateBallState();
    }

    skipSession() {
        this.completeSession();
    }

    completeSession() {
        this.isRunning = false;
        clearInterval(this.timer);
        
        // 保存会话记录
        const session = {
            id: Date.now(),
            type: this.currentPhase,
            duration: this.getPhaseTime(),
            startTime: new Date().toISOString(),
            completed: true
        };
        
        this.data.sessions.push(session);
        this.saveData();
        
        // 播放通知和闪烁效果
        this.playNotification();
        this.blinkBall();
        
        // 更新阶段
        if (this.currentPhase === 'work') {
            this.sessionCount++;
            
            if (this.sessionCount % this.data.settings.longBreakInterval === 0) {
                this.currentPhase = 'longBreak';
            } else {
                this.currentPhase = 'shortBreak';
            }
        } else {
            this.currentPhase = 'work';
        }
        
        // 准备下一个阶段
        this.timeLeft = this.getPhaseTime() * 60;
        this.updateDisplay();
        this.updateProgress();
        this.updateButtons();
        this.updatePhaseDisplay();
        this.updateBallState();
    }

    getPhaseTime() {
        switch (this.currentPhase) {
            case 'work':
                return this.data.settings.pomodoroTime;
            case 'shortBreak':
                return this.data.settings.shortBreakTime;
            case 'longBreak':
                return this.data.settings.longBreakTime;
            default:
                return 25;
        }
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('mini-time').textContent = display;
    }

    updateProgress() {
        const totalTime = this.getPhaseTime() * 60;
        const progress = 1 - (this.timeLeft / totalTime);
        const circumference = 2 * Math.PI * 55;
        const offset = circumference - (progress * circumference);
        
        this.progressRing.style.strokeDashoffset = offset;
    }

    updateButtons() {
        const startBtn = document.getElementById('mini-start');
        const pauseBtn = document.getElementById('mini-pause');
        const skipBtn = document.getElementById('mini-skip');
        
        if (this.isRunning) {
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            pauseBtn.title = '暂停';
            skipBtn.disabled = false;
        } else if (this.isPaused) {
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            pauseBtn.title = '继续';
            skipBtn.disabled = false;
        } else {
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            pauseBtn.title = '暂停';
            skipBtn.disabled = true;
        }
    }

    updatePhaseDisplay() {
        const phaseElement = document.getElementById('mini-phase');
        let phaseText = '';
        
        switch (this.currentPhase) {
            case 'work':
                phaseText = '●';
                break;
            case 'shortBreak':
                phaseText = '◐';
                break;
            case 'longBreak':
                phaseText = '◯';
                break;
        }
        
        phaseElement.textContent = phaseText;
    }

    updateBallState() {
        const ball = document.getElementById('mini-ball');
        const progressBar = this.progressRing;
        
        // 清除所有状态类
        ball.classList.remove('working', 'break', 'long-break', 'paused');
        
        let color = '#ff6b6b';
        
        if (this.isPaused) {
            ball.classList.add('paused');
            color = '#feca57';
        } else if (this.isRunning) {
            switch (this.currentPhase) {
                case 'work':
                    ball.classList.add('working');
                    color = '#ff6b6b';
                    break;
                case 'shortBreak':
                    ball.classList.add('break');
                    color = '#2dd36f';
                    break;
                case 'longBreak':
                    ball.classList.add('long-break');
                    color = '#4834d4';
                    break;
            }
        }
        
        progressBar.style.stroke = color;
    }

    blinkBall() {
        const ball = document.getElementById('mini-ball');
        ball.classList.add('blink');
        setTimeout(() => {
            ball.classList.remove('blink');
        }, 1500);
    }

    async playNotification() {
        const options = {
            title: 'Good Timer',
            body: this.getNotificationText(),
            sound: this.data.settings.soundEnabled
        };
        
        if (this.data.settings.notificationEnabled) {
            await ipcRenderer.invoke('show-notification', options);
        }
    }

    getNotificationText() {
        switch (this.currentPhase) {
            case 'shortBreak':
                return '工作完成！开始短休息吧';
            case 'longBreak':
                return '完成一轮番茄钟！开始长休息吧';
            case 'work':
                return '休息结束！开始下一个番茄钟';
            default:
                return '时间到！';
        }
    }

    showContextMenu(x, y) {
        const menu = document.getElementById('mini-context-menu');
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.classList.add('show');
        
        // 确保菜单在屏幕内
        setTimeout(() => {
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = (x - rect.width) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = (y - rect.height) + 'px';
            }
        }, 0);
    }

    hideContextMenu() {
        document.getElementById('mini-context-menu').classList.remove('show');
    }

    handleMenuAction(action) {
        switch (action) {
            case 'start':
                this.startTimer();
                break;
            case 'pause':
                this.pauseTimer();
                break;
            case 'skip':
                this.skipSession();
                break;
            case 'expand':
                this.expandToMain();
                break;
            case 'close':
                this.closeMini();
                break;
        }
    }

    async expandToMain() {
        try {
            await ipcRenderer.invoke('show-main-window');
        } catch (error) {
            console.error('Failed to expand to main window:', error);
        }
    }

    async closeMini() {
        try {
            await ipcRenderer.invoke('toggle-mini-mode');
        } catch (error) {
            console.error('Failed to close mini window:', error);
        }
    }

    async saveData() {
        try {
            await ipcRenderer.invoke('save-data', this.data);
        } catch (error) {
            console.error('Failed to save data:', error);
        }
    }

    // 与主应用同步状态
    async syncWithMainApp() {
        // 这里可以添加与主应用的状态同步逻辑
        setInterval(async () => {
            try {
                const latestData = await ipcRenderer.invoke('get-data');
                if (latestData) {
                    this.data = latestData;
                }
            } catch (error) {
                console.error('Failed to sync with main app:', error);
            }
        }, 5000); // 每5秒同步一次
    }
}

// 创建小球应用实例
const miniApp = new MiniTimerApp();

// 导出到全局作用域
window.miniApp = miniApp;
