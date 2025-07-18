const { ipcRenderer } = require('electron');

class GoodTimerApp {
    constructor() {
        this.currentView = 'pomodoro';
        this.timer = null;
        this.timeLeft = 25 * 60; // 25分钟
        this.isRunning = false;
        this.isPaused = false;
        this.sessionCount = 0;
        this.currentPhase = 'work'; // work, shortBreak, longBreak
        this.progressRing = null;
        this.trackingTimer = null;
        this.trackingStartTime = null;
        this.currentTrackingDuration = 0;
        this.data = null;
        this.charts = {};

        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.setupProgressRing();
        this.updateDisplay();
        this.loadSettings();
        this.updateTodayStats();
        this.initializeCharts();
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
                        notificationEnabled: true,
                        dailyGoal: 8,
                        pomodoroGoal: 8
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

    async saveData() {
        try {
            await ipcRenderer.invoke('save-data', this.data);
        } catch (error) {
            console.error('Failed to save data:', error);
        }
    }

    setupEventListeners() {
        // 导航菜单
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                this.switchView(view);
            });
        });

        // 番茄钟控制按钮
        document.getElementById('start-btn').addEventListener('click', () => this.startTimer());
        document.getElementById('pause-btn').addEventListener('click', () => this.pauseTimer());
        document.getElementById('skip-btn').addEventListener('click', () => this.skipSession());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetTimer());

        // 时间追踪按钮
        document.getElementById('new-project-btn').addEventListener('click', () => this.showProjectModal());
        document.getElementById('start-tracking').addEventListener('click', () => this.startTracking());
        document.getElementById('stop-tracking').addEventListener('click', () => this.stopTracking());

        // 项目模态框
        document.getElementById('save-project').addEventListener('click', () => this.saveProject());
        document.getElementById('cancel-project').addEventListener('click', () => this.hideProjectModal());
        document.querySelector('.modal-close').addEventListener('click', () => this.hideProjectModal());

        // 设置
        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());
        document.getElementById('export-data').addEventListener('click', () => this.exportData());
        document.getElementById('import-data').addEventListener('click', () => this.importData());
        document.getElementById('clear-data').addEventListener('click', () => this.clearData());

        // 报表筛选
        document.getElementById('period-select').addEventListener('change', (e) => {
            const customDates = document.getElementById('custom-dates');
            if (e.target.value === 'custom') {
                customDates.style.display = 'flex';
            } else {
                customDates.style.display = 'none';
            }
            this.updateReports();
        });

        document.getElementById('start-date').addEventListener('change', () => this.updateReports());
        document.getElementById('end-date').addEventListener('change', () => this.updateReports());

        // 日期和项目筛选
        document.getElementById('date-filter').addEventListener('change', () => this.updateTimeEntries());
        document.getElementById('project-filter').addEventListener('change', () => this.updateTimeEntries());

        // 目标设置
        document.getElementById('daily-goal').addEventListener('change', () => this.updateGoals());
        document.getElementById('pomodoro-goal').addEventListener('change', () => this.updateGoals());

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (this.currentView === 'pomodoro') {
                    if (!this.isRunning) {
                        this.startTimer();
                    } else {
                        this.pauseTimer();
                    }
                }
            }
        });

        // IPC 消息监听
        ipcRenderer.on('start-pomodoro', () => {
            this.switchView('pomodoro');
            this.startTimer();
        });

        ipcRenderer.on('toggle-pause', () => {
            if (this.currentView === 'pomodoro') {
                this.pauseTimer();
            }
        });

        ipcRenderer.on('skip-current', () => {
            if (this.currentView === 'pomodoro') {
                this.skipSession();
            }
        });

        ipcRenderer.on('switch-view', (event, view) => {
            this.switchView(view);
        });
    }

    setupProgressRing() {
        this.progressRing = document.querySelector('.progress-ring-progress');
        const radius = this.progressRing.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        
        this.progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
        this.progressRing.style.strokeDashoffset = circumference;
    }

    switchView(view) {
        // 更新导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-view="${view}"]`).classList.add('active');

        // 更新视图
        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
        });
        document.getElementById(`${view}-view`).classList.add('active');

        this.currentView = view;

        // 根据视图更新内容
        if (view === 'tracking') {
            this.updateProjectSelects();
            this.updateTimeEntries();
        } else if (view === 'reports') {
            this.updateReports();
        } else if (view === 'settings') {
            this.loadSettings();
        }
    }

    // 番茄钟功能
    startTimer() {
        if (this.isPaused) {
            this.isPaused = false;
        } else {
            this.timeLeft = this.getPhaseTime() * 60;
        }
        
        this.isRunning = true;
        this.updateButtons();
        this.updatePhaseDisplay();
        
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
        }
        this.updateButtons();
    }

    skipSession() {
        this.completeSession();
    }

    resetTimer() {
        this.isRunning = false;
        this.isPaused = false;
        clearInterval(this.timer);
        this.timeLeft = this.getPhaseTime() * 60;
        this.updateDisplay();
        this.updateProgress();
        this.updateButtons();
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
        
        // 播放通知
        this.playNotification();
        
        // 更新阶段
        if (this.currentPhase === 'work') {
            this.sessionCount++;
            document.getElementById('session-count').textContent = this.sessionCount;
            
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
        this.updateTodayStats();
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
        document.getElementById('timer-display').textContent = display;
    }

    updateProgress() {
        const totalTime = this.getPhaseTime() * 60;
        const progress = 1 - (this.timeLeft / totalTime);
        const circumference = 2 * Math.PI * 140; // radius = 140
        const offset = circumference - (progress * circumference);
        
        this.progressRing.style.strokeDashoffset = offset;
    }

    updateButtons() {
        const startBtn = document.getElementById('start-btn');
        const pauseBtn = document.getElementById('pause-btn');
        const skipBtn = document.getElementById('skip-btn');
        
        if (this.isRunning) {
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
            skipBtn.disabled = false;
        } else if (this.isPaused) {
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            pauseBtn.innerHTML = '<i class="fas fa-play"></i> 继续';
            skipBtn.disabled = false;
        } else {
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
            skipBtn.disabled = true;
        }
    }

    updatePhaseDisplay() {
        const phaseElement = document.getElementById('timer-phase');
        let phaseText = '';
        let color = '#ff6b6b';
        
        switch (this.currentPhase) {
            case 'work':
                phaseText = this.isRunning ? '专注工作中' : '准备专注工作';
                color = '#ff6b6b';
                break;
            case 'shortBreak':
                phaseText = this.isRunning ? '短休息中' : '准备短休息';
                color = '#2dd36f';
                break;
            case 'longBreak':
                phaseText = this.isRunning ? '长休息中' : '准备长休息';
                color = '#4834d4';
                break;
        }
        
        phaseElement.textContent = phaseText;
        this.progressRing.style.stroke = color;
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

    updateTodayStats() {
        const today = new Date().toDateString();
        const todaySessions = this.data.sessions.filter(session => 
            new Date(session.startTime).toDateString() === today
        );
        
        const completedPomodoros = todaySessions.filter(s => s.type === 'work' && s.completed).length;
        const totalTime = todaySessions.reduce((sum, s) => sum + (s.completed ? s.duration : 0), 0);
        const breaks = todaySessions.filter(s => s.type !== 'work' && s.completed).length;
        
        document.getElementById('today-pomodoros').textContent = completedPomodoros;
        document.getElementById('today-time').textContent = this.formatDuration(totalTime);
        document.getElementById('today-breaks').textContent = breaks;
        
        // 更新目标进度
        this.updateGoalProgress();
    }

    formatDuration(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    }

    // 时间追踪功能
    showProjectModal() {
        document.getElementById('project-modal').classList.add('show');
    }

    hideProjectModal() {
        document.getElementById('project-modal').classList.remove('show');
        this.clearProjectForm();
    }

    clearProjectForm() {
        document.getElementById('project-name').value = '';
        document.getElementById('project-color').value = '#ff6b6b';
        document.getElementById('project-description').value = '';
    }

    saveProject() {
        const name = document.getElementById('project-name').value.trim();
        const color = document.getElementById('project-color').value;
        const description = document.getElementById('project-description').value.trim();
        
        if (!name) {
            alert('请输入项目名称');
            return;
        }
        
        const project = {
            id: Date.now(),
            name,
            color,
            description,
            createdAt: new Date().toISOString()
        };
        
        this.data.projects.push(project);
        this.saveData();
        this.updateProjectSelects();
        this.hideProjectModal();
    }

    updateProjectSelects() {
        const selects = [
            document.getElementById('project-select'),
            document.getElementById('project-filter')
        ];
        
        selects.forEach(select => {
            // 保留第一个选项
            const firstOption = select.children[0];
            select.innerHTML = '';
            select.appendChild(firstOption);
            
            this.data.projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            });
        });
    }

    startTracking() {
        const projectId = document.getElementById('project-select').value;
        const description = document.getElementById('task-description').value.trim();
        
        if (!projectId) {
            alert('请选择项目');
            return;
        }
        
        this.trackingStartTime = new Date();
        this.currentTrackingDuration = 0;
        
        document.getElementById('start-tracking').disabled = true;
        document.getElementById('stop-tracking').disabled = false;
        
        this.trackingTimer = setInterval(() => {
            this.currentTrackingDuration++;
            this.updateTrackingDisplay();
        }, 1000);
    }

    stopTracking() {
        if (!this.trackingTimer) return;
        
        clearInterval(this.trackingTimer);
        
        const projectId = parseInt(document.getElementById('project-select').value);
        const description = document.getElementById('task-description').value.trim();
        const duration = Math.floor(this.currentTrackingDuration / 60); // 转换为分钟
        
        if (duration > 0) {
            const entry = {
                id: Date.now(),
                projectId,
                description,
                duration,
                startTime: this.trackingStartTime.toISOString(),
                endTime: new Date().toISOString()
            };
            
            this.data.timeEntries.push(entry);
            this.saveData();
            this.updateTimeEntries();
        }
        
        this.trackingTimer = null;
        this.trackingStartTime = null;
        this.currentTrackingDuration = 0;
        
        document.getElementById('start-tracking').disabled = false;
        document.getElementById('stop-tracking').disabled = true;
        document.getElementById('current-duration').textContent = '00:00:00';
        document.getElementById('task-description').value = '';
    }

    updateTrackingDisplay() {
        const hours = Math.floor(this.currentTrackingDuration / 3600);
        const minutes = Math.floor((this.currentTrackingDuration % 3600) / 60);
        const seconds = this.currentTrackingDuration % 60;
        
        const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('current-duration').textContent = display;
    }

    updateTimeEntries() {
        const dateFilter = document.getElementById('date-filter').value;
        const projectFilter = document.getElementById('project-filter').value;
        const entriesList = document.getElementById('entries-list');
        
        let filteredEntries = [...this.data.timeEntries];
        
        // 日期筛选
        if (dateFilter) {
            filteredEntries = filteredEntries.filter(entry => 
                new Date(entry.startTime).toDateString() === new Date(dateFilter).toDateString()
            );
        }
        
        // 项目筛选
        if (projectFilter) {
            filteredEntries = filteredEntries.filter(entry => 
                entry.projectId === parseInt(projectFilter)
            );
        }
        
        // 按时间倒序排列
        filteredEntries.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        entriesList.innerHTML = '';
        
        filteredEntries.forEach(entry => {
            const project = this.data.projects.find(p => p.id === entry.projectId);
            const entryElement = this.createEntryElement(entry, project);
            entriesList.appendChild(entryElement);
        });
    }

    createEntryElement(entry, project) {
        const div = document.createElement('div');
        div.className = 'entry-item';
        
        const startTime = new Date(entry.startTime);
        const endTime = new Date(entry.endTime);
        
        div.innerHTML = `
            <div class="entry-info">
                <div class="entry-project" style="color: ${project ? project.color : '#999'}">
                    ${project ? project.name : '未知项目'}
                </div>
                <div class="entry-task">${entry.description || '无描述'}</div>
                <div class="entry-time-range">
                    ${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}
                </div>
            </div>
            <div class="entry-time">${this.formatDuration(entry.duration)}</div>
            <div class="entry-actions">
                <button class="btn btn-small btn-outline" onclick="app.editEntry(${entry.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-small btn-danger" onclick="app.deleteEntry(${entry.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        return div;
    }

    deleteEntry(entryId) {
        if (confirm('确定要删除这条记录吗？')) {
            this.data.timeEntries = this.data.timeEntries.filter(entry => entry.id !== entryId);
            this.saveData();
            this.updateTimeEntries();
        }
    }

    // 统计报表功能
    updateReports() {
        const period = document.getElementById('period-select').value;
        let startDate, endDate;
        
        const now = new Date();
        
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                break;
            case 'week':
                const dayOfWeek = now.getDay();
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 7);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                break;
            case 'custom':
                const startInput = document.getElementById('start-date').value;
                const endInput = document.getElementById('end-date').value;
                if (startInput && endInput) {
                    startDate = new Date(startInput);
                    endDate = new Date(endInput);
                    endDate.setDate(endDate.getDate() + 1);
                } else {
                    return;
                }
                break;
        }
        
        this.generateReports(startDate, endDate);
    }

    generateReports(startDate, endDate) {
        // 筛选数据
        const sessions = this.data.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= startDate && sessionDate < endDate && session.completed;
        });
        
        const timeEntries = this.data.timeEntries.filter(entry => {
            const entryDate = new Date(entry.startTime);
            return entryDate >= startDate && entryDate < endDate;
        });
        
        // 计算统计数据
        const totalTime = timeEntries.reduce((sum, entry) => sum + entry.duration, 0);
        const totalSessions = sessions.filter(s => s.type === 'work').length;
        const avgSession = totalSessions > 0 ? Math.round(totalTime / totalSessions) : 0;
        const productivityScore = this.calculateProductivityScore(sessions, timeEntries);
        
        // 更新显示
        document.getElementById('total-time').textContent = this.formatDuration(totalTime);
        document.getElementById('total-sessions').textContent = totalSessions;
        document.getElementById('avg-session').textContent = `${avgSession}m`;
        document.getElementById('productivity-score').textContent = `${productivityScore}%`;
        
        // 更新图表
        this.updateCharts(sessions, timeEntries);
    }

    calculateProductivityScore(sessions, timeEntries) {
        // 简单的效率评分算法
        const workSessions = sessions.filter(s => s.type === 'work').length;
        const totalTime = timeEntries.reduce((sum, entry) => sum + entry.duration, 0);
        const expectedTime = workSessions * 25; // 每个番茄钟25分钟
        
        if (expectedTime === 0) return 0;
        
        const efficiency = Math.min(100, Math.round((totalTime / expectedTime) * 100));
        return efficiency;
    }

    initializeCharts() {
        // 时间分布图表
        const timeCtx = document.getElementById('time-chart').getContext('2d');
        this.charts.timeChart = new Chart(timeCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: '工作时间（分钟）',
                    data: [],
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
        
        // 项目时间占比图表
        const projectCtx = document.getElementById('project-chart').getContext('2d');
        this.charts.projectChart = new Chart(projectCtx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: []
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    updateCharts(sessions, timeEntries) {
        // 更新时间分布图表
        this.updateTimeChart(timeEntries);
        
        // 更新项目时间占比图表
        this.updateProjectChart(timeEntries);
    }

    updateTimeChart(timeEntries) {
        // 按日期分组
        const dailyData = {};
        timeEntries.forEach(entry => {
            const date = new Date(entry.startTime).toDateString();
            dailyData[date] = (dailyData[date] || 0) + entry.duration;
        });
        
        const labels = Object.keys(dailyData).sort();
        const data = labels.map(date => dailyData[date]);
        
        this.charts.timeChart.data.labels = labels.map(date => 
            new Date(date).toLocaleDateString()
        );
        this.charts.timeChart.data.datasets[0].data = data;
        this.charts.timeChart.update();
    }

    updateProjectChart(timeEntries) {
        // 按项目分组
        const projectData = {};
        timeEntries.forEach(entry => {
            const project = this.data.projects.find(p => p.id === entry.projectId);
            const projectName = project ? project.name : '未知项目';
            projectData[projectName] = (projectData[projectName] || 0) + entry.duration;
        });
        
        const labels = Object.keys(projectData);
        const data = Object.values(projectData);
        const colors = labels.map(label => {
            const project = this.data.projects.find(p => p.name === label);
            return project ? project.color : '#999';
        });
        
        this.charts.projectChart.data.labels = labels;
        this.charts.projectChart.data.datasets[0].data = data;
        this.charts.projectChart.data.datasets[0].backgroundColor = colors;
        this.charts.projectChart.update();
    }

    updateGoals() {
        const dailyGoal = parseInt(document.getElementById('daily-goal').value);
        const pomodoroGoal = parseInt(document.getElementById('pomodoro-goal').value);
        
        this.data.settings.dailyGoal = dailyGoal;
        this.data.settings.pomodoroGoal = pomodoroGoal;
        this.saveData();
        
        this.updateGoalProgress();
    }

    updateGoalProgress() {
        const today = new Date().toDateString();
        const todaySessions = this.data.sessions.filter(session => 
            new Date(session.startTime).toDateString() === today && session.completed
        );
        
        const todayEntries = this.data.timeEntries.filter(entry =>
            new Date(entry.startTime).toDateString() === today
        );
        
        const completedPomodoros = todaySessions.filter(s => s.type === 'work').length;
        const totalTimeToday = todayEntries.reduce((sum, entry) => sum + entry.duration, 0);
        const totalHoursToday = Math.round(totalTimeToday / 60 * 10) / 10;
        
        // 更新时间进度
        const timeProgress = Math.min(100, (totalHoursToday / this.data.settings.dailyGoal) * 100);
        document.getElementById('time-progress').style.width = `${timeProgress}%`;
        document.getElementById('time-progress-text').textContent = 
            `${totalHoursToday}/${this.data.settings.dailyGoal}小时`;
        
        // 更新番茄钟进度
        const pomodoroProgress = Math.min(100, (completedPomodoros / this.data.settings.pomodoroGoal) * 100);
        document.getElementById('pomodoro-progress').style.width = `${pomodoroProgress}%`;
        document.getElementById('pomodoro-progress-text').textContent = 
            `${completedPomodoros}/${this.data.settings.pomodoroGoal}个`;
    }

    // 设置功能
    loadSettings() {
        const settings = this.data.settings;
        
        document.getElementById('pomodoro-time').value = settings.pomodoroTime;
        document.getElementById('short-break-time').value = settings.shortBreakTime;
        document.getElementById('long-break-time').value = settings.longBreakTime;
        document.getElementById('long-break-interval').value = settings.longBreakInterval;
        document.getElementById('sound-enabled').checked = settings.soundEnabled;
        document.getElementById('notification-enabled').checked = settings.notificationEnabled;
        document.getElementById('daily-goal').value = settings.dailyGoal || 8;
        document.getElementById('pomodoro-goal').value = settings.pomodoroGoal || 8;
    }

    saveSettings() {
        this.data.settings = {
            pomodoroTime: parseInt(document.getElementById('pomodoro-time').value),
            shortBreakTime: parseInt(document.getElementById('short-break-time').value),
            longBreakTime: parseInt(document.getElementById('long-break-time').value),
            longBreakInterval: parseInt(document.getElementById('long-break-interval').value),
            soundEnabled: document.getElementById('sound-enabled').checked,
            notificationEnabled: document.getElementById('notification-enabled').checked,
            dailyGoal: parseInt(document.getElementById('daily-goal').value),
            pomodoroGoal: parseInt(document.getElementById('pomodoro-goal').value)
        };
        
        this.saveData();
        
        // 如果当前在工作状态且时间设置有变化，重置计时器
        if (!this.isRunning && !this.isPaused) {
            this.timeLeft = this.getPhaseTime() * 60;
            this.updateDisplay();
            this.updateProgress();
        }
        
        alert('设置已保存');
    }

    async exportData() {
        try {
            await ipcRenderer.invoke('export-data');
        } catch (error) {
            console.error('Export failed:', error);
            alert('导出失败');
        }
    }

    async importData() {
        try {
            await ipcRenderer.invoke('import-data');
        } catch (error) {
            console.error('Import failed:', error);
            alert('导入失败');
        }
    }

    clearData() {
        if (confirm('确定要清除所有数据吗？此操作不可恢复！')) {
            this.data = {
                settings: this.data.settings, // 保留设置
                sessions: [],
                projects: [],
                timeEntries: []
            };
            this.saveData();
            this.updateTodayStats();
            this.updateProjectSelects();
            this.updateTimeEntries();
            this.updateReports();
            alert('数据已清除');
        }
    }
}

// 创建应用实例
const app = new GoodTimerApp();

// 导出到全局作用域供HTML调用
window.app = app;
