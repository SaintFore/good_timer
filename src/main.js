const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  Notification,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");

class GoodTimerApp {
  constructor() {
    this.mainWindow = null;
    this.miniWindow = null;
    this.tray = null;
    this.dataPath = path.join(app.getPath("userData"), "timer-data.json");
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

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });
  }

  createWindow() {
    // 根据是否打包选择不同的图标路径
    let iconPath;
    if (app.isPackaged) {
      iconPath = path.join(process.resourcesPath, "assets", "icon.png");
    } else {
      iconPath = path.join(__dirname, "../assets/icon.png");
    }

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      icon: iconPath,
      show: false,
      titleBarStyle: "default",
    });

    this.mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));

    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow.show();
    });

    this.mainWindow.on("close", (event) => {
      if (!app.isQuiting) {
        event.preventDefault();
        this.mainWindow.hide();
      }
      return false;
    });
  }

  createMiniWindow() {
    if (this.miniWindow) {
      this.miniWindow.show();
      return;
    }

    this.miniWindow = new BrowserWindow({
      width: 120,
      height: 120,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      show: false,
      skipTaskbar: true,
    });

    this.miniWindow.loadFile(path.join(__dirname, "renderer/mini.html"));

    this.miniWindow.once("ready-to-show", () => {
      this.miniWindow.show();
      this.positionMiniWindow();
    });

    this.miniWindow.on("closed", () => {
      this.miniWindow = null;
    });

    // 允许拖拽窗口
    this.miniWindow.on("move", () => {
      // 窗口移动时的处理
    });
  }

  positionMiniWindow() {
    if (!this.miniWindow) return;

    const { screen } = require("electron");
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // 默认位置在右上角
    this.miniWindow.setPosition(width - 150, 50);
  }

  toggleMiniMode() {
    if (this.miniWindow && this.miniWindow.isVisible()) {
      // 退出小球模式
      this.miniWindow.hide();
      this.mainWindow.show();
    } else {
      // 进入小球模式
      this.mainWindow.hide();
      this.createMiniWindow();
    }
  }

  createTray() {
    let trayIcon;

    try {
      // 根据是否打包选择不同的图标路径
      let iconPath;
      if (app.isPackaged) {
        // 打包后的路径
        iconPath = path.join(process.resourcesPath, "assets", "tray.ico");
      } else {
        // 开发环境路径
        iconPath = path.join(__dirname, "../assets/tray.ico");
      }

      console.log("Tray icon path:", iconPath);
      console.log("File exists:", fs.existsSync(iconPath));

      const image = nativeImage.createFromPath(iconPath);
      if (image.isEmpty()) {
        throw new Error("Icon file not found or invalid");
      }
      trayIcon = image.resize({ width: 16, height: 16 });
    } catch (error) {
      console.error("Failed to create tray icon, using fallback.", error);
      // Fallback: create a simple icon programmatically
      trayIcon = this.createDefaultTrayIcon();
    }

    this.tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "显示主界面",
        click: () => {
          if (this.miniWindow && this.miniWindow.isVisible()) {
            this.miniWindow.hide();
          }
          this.mainWindow.show();
        },
      },
      {
        label: "小球模式",
        click: () => {
          this.toggleMiniMode();
        },
      },
      { type: "separator" },
      {
        label: "开始番茄钟",
        click: () => {
          this.sendToActiveWindow("start-pomodoro");
        },
      },
      {
        label: "暂停/继续",
        click: () => {
          this.sendToActiveWindow("toggle-pause");
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          app.isQuiting = true;
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.setToolTip("Good Timer - 番茄钟时间管理");

    this.tray.on("double-click", () => {
      if (this.miniWindow && this.miniWindow.isVisible()) {
        this.miniWindow.hide();
      }
      this.mainWindow.show();
    });
  }

  // 添加这个新方法来创建默认图标
  createDefaultTrayIcon() {
    // 创建一个简单的16x16像素的PNG图标
    const iconBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61, 0x00, 0x00, 0x00,
      0x7d, 0x49, 0x44, 0x41, 0x54, 0x38, 0x8d, 0x9d, 0x93, 0x41, 0x0a, 0x80,
      0x20, 0x0c, 0x05, 0x5b, 0xf6, 0x7f, 0x6f, 0x35, 0x8e, 0x48, 0x44, 0x04,
      0x11, 0x85, 0x26, 0x4a, 0x92, 0x24, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10,
      0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10,
      0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10,
      0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10,
      0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10,
      0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10,
      0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10,
      0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10, 0x04, 0x41, 0x10,
      0x04, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60,
      0x82,
    ]);

    return nativeImage.createFromBuffer(iconBuffer);
  }

  sendToActiveWindow(message, ...args) {
    if (this.miniWindow && this.miniWindow.isVisible()) {
      this.miniWindow.webContents.send(message, ...args);
    } else if (this.mainWindow && this.mainWindow.isVisible()) {
      this.mainWindow.webContents.send(message, ...args);
    }
  }

  setupMenu() {
    const template = [
      {
        label: "文件",
        submenu: [
          {
            label: "导出数据",
            click: () => {
              this.exportData();
            },
          },
          {
            label: "导入数据",
            click: () => {
              this.importData();
            },
          },
          {
            label: "小球模式",
            accelerator: "CmdOrCtrl+M",
            click: () => {
              this.toggleMiniMode();
            },
          },
          { type: "separator" },
          {
            label: "退出",
            accelerator: "CmdOrCtrl+Q",
            click: () => {
              app.isQuiting = true;
              app.quit();
            },
          },
        ],
      },
      {
        label: "计时器",
        submenu: [
          {
            label: "开始番茄钟",
            accelerator: "Space",
            click: () => {
              this.sendToActiveWindow("start-pomodoro");
            },
          },
          {
            label: "暂停/继续",
            accelerator: "CmdOrCtrl+P",
            click: () => {
              this.sendToActiveWindow("toggle-pause");
            },
          },
          {
            label: "跳过当前",
            accelerator: "CmdOrCtrl+S",
            click: () => {
              this.sendToActiveWindow("skip-current");
            },
          },
        ],
      },
      {
        label: "视图",
        submenu: [
          {
            label: "番茄钟",
            click: () => {
              this.mainWindow.webContents.send("switch-view", "pomodoro");
            },
          },
          {
            label: "时间追踪",
            click: () => {
              this.mainWindow.webContents.send("switch-view", "tracking");
            },
          },
          {
            label: "统计报表",
            click: () => {
              this.mainWindow.webContents.send("switch-view", "reports");
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  setupIPC() {
    ipcMain.handle("get-data", () => {
      return this.loadData();
    });

    ipcMain.handle("save-data", (event, data) => {
      return this.saveData(data);
    });

    ipcMain.handle("show-notification", (event, options) => {
      this.showNotification(options);
    });

    ipcMain.handle("export-data", () => {
      return this.exportData();
    });

    ipcMain.handle("import-data", () => {
      return this.importData();
    });

    ipcMain.handle("toggle-mini-mode", () => {
      this.toggleMiniMode();
    });

    ipcMain.handle("show-main-window", () => {
      if (this.miniWindow && this.miniWindow.isVisible()) {
        this.miniWindow.hide();
      }
      this.mainWindow.show();
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
          notificationEnabled: true,
        },
        sessions: [],
        projects: [],
        timeEntries: [],
      };
      this.saveData(initialData);
    }
  }

  loadData() {
    try {
      const data = fs.readFileSync(this.dataPath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Error loading data:", error);
      return null;
    }
  }

  saveData(data) {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error("Error saving data:", error);
      return false;
    }
  }

  showNotification(options) {
    if (Notification.isSupported()) {
      // 根据是否打包选择不同的图标路径
      let iconPath;
      if (app.isPackaged) {
        iconPath = path.join(process.resourcesPath, "assets", "icon.png");
      } else {
        iconPath = path.join(__dirname, "../assets/icon.png");
      }

      new Notification({
        title: options.title || "Good Timer",
        body: options.body || "",
        icon: iconPath,
        sound: options.sound || false,
      }).show();
    }
  }

  async exportData() {
    try {
      const result = await dialog.showSaveDialog(this.mainWindow, {
        title: "导出数据",
        defaultPath: `good-timer-backup-${
          new Date().toISOString().split("T")[0]
        }.json`,
        filters: [{ name: "JSON files", extensions: ["json"] }],
      });

      if (!result.canceled) {
        const data = this.loadData();
        fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
        this.showNotification({
          title: "导出成功",
          body: "数据已成功导出",
        });
        return true;
      }
    } catch (error) {
      console.error("Export error:", error);
      return false;
    }
  }

  async importData() {
    try {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        title: "导入数据",
        filters: [{ name: "JSON files", extensions: ["json"] }],
        properties: ["openFile"],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const importedData = JSON.parse(
          fs.readFileSync(result.filePaths[0], "utf8")
        );
        this.saveData(importedData);
        this.showNotification({
          title: "导入成功",
          body: "数据已成功导入，请重启应用",
        });
        return true;
      }
    } catch (error) {
      console.error("Import error:", error);
      return false;
    }
  }
}

new GoodTimerApp();
