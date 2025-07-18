const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

class GoodTimerApp {
    constructor() {
        this.mainWindow = null;
        this.tray = null;
        this.dataPath = path.join(app.getPath('userData'), 'timer-data.json');
        this.initializeData();
        this.setupApp();
    }

    setupApp() {
        app.whenReady().then(() => {
            this.createWindow();
            this.createTray();
            this.setupMenu();
            this.setupIPC();
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });
    }

    createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            icon: path.join(__dirname, '../assets/icon.png'),
            show: false,
            titleBarStyle: 'default'
        });

        this.mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
        
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
        });

        this.mainWindow.on('close', (event) => {
            if (!app.isQuiting) {
                event.preventDefault();
                this.mainWindow.hide();
            }
            return false;
        });
    }

    createTray() {
        const iconPath = path.join(__dirname, '../assets/tray-icon.png');
        let trayIcon;
        
        try {
            trayIcon = nativeImage.createFromPath(iconPath);
        } catch (error) {
            // Fallback: create a simple icon programmatically
            trayIcon = nativeImage.createEmpty();
        }
        
        this.tray = new Tray(trayIcon);
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: '显示主界面',
                click: () => {
                    this.mainWindow.show();
                }
            },
            {
                label: '开始番茄钟',
                click: () => {
                    this.mainWindow.webContents.send('start-pomodoro');
                }
            },
            {
                label: '暂停/继续',
                click: () => {
                    this.mainWindow.webContents.send('toggle-pause');
                }
            },
            { type: 'separator' },
            {
                label: '退出',
                click: () => {
                    app.isQuiting = true;
                    app.quit();
                }
            }
        ]);
        
        this.tray.setContextMenu(contextMenu);
        this.tray.setToolTip('Good Timer - 番茄钟时间管理');
        
        this.tray.on('double-click', () => {
            this.mainWindow.show();
        });
    }

    setupMenu() {
        const template = [
            {
                label: '文件',
                submenu: [
                    {
                        label: '导出数据',
                        click: () => {
                            this.exportData();
                        }
                    },
                    {
                        label: '导入数据',
                        click: () => {
                            this.importData();
                        }
                    },
                    { type: 'separator' },
                    {
                        label: '退出',
                        accelerator: 'CmdOrCtrl+Q',
                        click: () => {
                            app.isQuiting = true;
                            app.quit();
                        }
                    }
                ]
            },
            {
                label: '计时器',
                submenu: [
                    {
                        label: '开始番茄钟',
                        accelerator: 'Space',
                        click: () => {
                            this.mainWindow.webContents.send('start-pomodoro');
                        }
                    },
                    {
                        label: '暂停/继续',
                        accelerator: 'CmdOrCtrl+P',
                        click: () => {
                            this.mainWindow.webContents.send('toggle-pause');
                        }
                    },
                    {
                        label: '跳过当前',
                        accelerator: 'CmdOrCtrl+S',
                        click: () => {
                            this.mainWindow.webContents.send('skip-current');
                        }
                    }
                ]
            },
            {
                label: '视图',
                submenu: [
                    {
                        label: '番茄钟',
                        click: () => {
                            this.mainWindow.webContents.send('switch-view', 'pomodoro');
                        }
                    },
                    {
                        label: '时间追踪',
                        click: () => {
                            this.mainWindow.webContents.send('switch-view', 'tracking');
                        }
                    },
                    {
                        label: '统计报表',
                        click: () => {
                            this.mainWindow.webContents.send('switch-view', 'reports');
                        }
                    }
                ]
            }
        ];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    setupIPC() {
        ipcMain.handle('get-data', () => {
            return this.loadData();
        });

        ipcMain.handle('save-data', (event, data) => {
            return this.saveData(data);
        });

        ipcMain.handle('show-notification', (event, options) => {
            this.showNotification(options);
        });

        ipcMain.handle('export-data', () => {
            return this.exportData();
        });

        ipcMain.handle('import-data', () => {
            return this.importData();
        });
    }

    initializeData() {
        if (!fs.existsSync(this.dataPath)) {
            const initialData = {
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
            this.saveData(initialData);
        }
    }

    loadData() {
        try {
            const data = fs.readFileSync(this.dataPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading data:', error);
            return null;
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving data:', error);
            return false;
        }
    }

    showNotification(options) {
        if (Notification.isSupported()) {
            new Notification({
                title: options.title || 'Good Timer',
                body: options.body || '',
                icon: path.join(__dirname, '../assets/icon.png'),
                sound: options.sound || false
            }).show();
        }
    }

    async exportData() {
        try {
            const result = await dialog.showSaveDialog(this.mainWindow, {
                title: '导出数据',
                defaultPath: `good-timer-backup-${new Date().toISOString().split('T')[0]}.json`,
                filters: [
                    { name: 'JSON files', extensions: ['json'] }
                ]
            });

            if (!result.canceled) {
                const data = this.loadData();
                fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
                this.showNotification({
                    title: '导出成功',
                    body: '数据已成功导出'
                });
                return true;
            }
        } catch (error) {
            console.error('Export error:', error);
            return false;
        }
    }

    async importData() {
        try {
            const result = await dialog.showOpenDialog(this.mainWindow, {
                title: '导入数据',
                filters: [
                    { name: 'JSON files', extensions: ['json'] }
                ],
                properties: ['openFile']
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const importedData = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
                this.saveData(importedData);
                this.showNotification({
                    title: '导入成功',
                    body: '数据已成功导入，请重启应用'
                });
                return true;
            }
        } catch (error) {
            console.error('Import error:', error);
            return false;
        }
    }
}

new GoodTimerApp();
