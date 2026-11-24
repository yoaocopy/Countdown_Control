# Countdown Overlay · 倒计时悬浮窗

## English

### Run on Windows 11 x64

Extract the entire `CountdownOverlay-…-win-x64.zip` and double-click `CountdownOverlay.exe`. Keep the extracted files together. The ZIP includes Electron and runs without a separate Node.js, Python, or WebView2 installation on the projection PC.

The window starts locked, stays on top, and lets mouse clicks pass through. It shows the timer, current group, and next two groups. Find the clock icon in the Windows notification area, including the hidden-icons menu. Click it or choose **Adjust overlay** from its menu. Opening the EXE again also opens the settings for the existing window.

Right-click the clock icon to see **Offline (standalone)**, **Online (connected)**, or **Online (disconnected)**. The checked **Always on top** item reflects the window's Windows topmost state. Another topmost or special full-screen window can still cover it. Use **Bring to front** to raise it again.

Turn on **Respond to mouse** in the tray menu to drag the overlay with the left button or right-click it for quick layout, theme, sound, and settings controls. In this mode the overlay receives clicks inside its area, and native menus or the settings panel can temporarily interrupt PowerPoint keyboard input. Before advancing slides, turn off **Respond to mouse** or choose **Lock** in the settings panel. With the mouse passing through, the overlay does not take focus during normal remote updates. Mouse response starts off each time the app opens.

- Drag the settings header to move the window. Choose **Screen** to move it to another monitor. Set **Width** and **Height** in Windows logical pixels and click **Resize**.
- Use **Overall opacity** to fade the whole display and **Background opacity** to fade only the card. The compact layouts place the queue beside or above the timer. **Soft fade** keeps the selected opacity around the text and fades outward to clear. **Defined border** keeps a visible outline. **Text only** removes the background in any layout.
- Choose **Follow console** and enter the timer service’s base address, such as `https://example.edu/timer/` or `http://192.168.1.40:8000/`. Click **Apply source**. The teacher continues to pair and control the timer from the web console. If the connection drops, the overlay shows the last known state and keeps counting toward the last known deadline. It resynchronizes on reconnection.
- Choose **Standalone timer** and click **Apply source** to use the app without a server. Set the duration and use the timer controls in the menu. **Use two stages** enables Presentation and Q&A with optional auto-start. Standalone mode displays `N/A` for the current group.
- Choose **Lock** before presenting. The menu closes and click-through resumes. From the tray menu, **Bring to front** raises the overlay and **Quit** closes it. If the browser projection and overlay are both open on the venue PC, mute one of them to avoid two simultaneous bells.

For remote adjustments, open **Desktop overlay** in the paired, online web console. Choose a layout, preset position or custom offsets, dimensions, and opacity, then click **Apply to desktop overlay**. Every desktop app following that server uses its own selected display. The web projection keeps its original layout. Settings are saved on the server and applied when an app connects or when you apply a new change.

The preview shows unsaved edits. Use **Read current app settings** to replace the form with the connected app’s actual position, size, layout, edge, and opacity. If several apps are connected, choose which one to read. Reading fills the form and preview. **Apply to desktop overlay** sends the settings to the apps following the server.

### Build and test

From `app_JS_Electron` on Windows x64 with Node.js 22.12 or newer:

```powershell
npm ci
npm test
npm start
npm run package:win
```

`npm start` opens the development app and keeps running until you quit it from the tray. The first launch or package build downloads the pinned Electron binary. `npm run package:win` writes the ZIP to `dist/`. The build copies the shared projection files from the sibling `web/` directory into the ZIP.

On the actual PowerPoint setup, verify Slide Show and Presenter View on the intended screen. Click through the locked overlay, advance slides with the keyboard or presenter remote, and use the teacher console to change groups while presenting. Also verify multi-monitor placement, opacity on the projector, and the correct sound output. The portable ZIP currently targets Windows x64.

## 中文

### 在 Windows 11 x64 上运行

完整解压 `CountdownOverlay-…-win-x64.zip`，双击 `CountdownOverlay.exe`，并保留同目录文件。发布包含 Electron，放映电脑无需另装 Node.js、Python 或 WebView2。

窗口启动后默认置顶、锁定并允许鼠标穿透，显示倒计时、当前组和后续两组。在 Windows 通知区域找到时钟图标，也可展开隐藏图标查找。点击图标，或右键选**调整悬浮窗**即可打开菜单。再次双击 EXE 也会打开现有窗口的设置。

右键托盘图标可看到**离线（独立计时）**、**在线（已连接）**或**在线（未连接）**。**始终置顶**的勾选状态反映 Windows 的窗口置顶状态。其他置顶窗口或某些全屏窗口仍可能覆盖它，可用**移到最前**重新提到前面。

在托盘菜单打开**响应鼠标**后，可在悬浮窗上用左键拖动，右键可快捷切换布局、主题、静音或进入设置。此时悬浮窗区域内的点击会由悬浮窗接收，打开原生菜单或设置也可能暂时影响 PPT 的键盘输入。正式放映时建议关闭**响应鼠标**，或在设置中点击**锁定**。恢复鼠标穿透后，远端更新不会主动获取焦点。每次重新打开 App 默认穿透。

- 拖动菜单标题栏可移动窗口。用**屏幕**下拉框换屏，输入**宽度**和**高度**后点**调整尺寸**。尺寸以 Windows 逻辑像素计。
- 用**整体不透明度**调节包括文字在内的整个显示区，用**背景不透明度**只调节底板。紧凑布局可把队列放在数字侧边或上方。**柔和渐隐**在文字周围保留设定的不透明度，向外渐隐到透明。**清晰边框**保留可见轮廓。所有布局都能开启**仅文字**。
- 选**跟随控制台**，填倒计时服务的基地址，例如 `https://example.edu/timer/` 或 `http://192.168.1.40:8000/`，再点**应用来源**。老师仍在网页控制台配对和管理计时。断线时按最后收到的状态和截止时间显示，重连后自动校准。
- 没有服务器时，选**独立计时**并点击**应用来源**。在菜单中设置时长并使用计时控件，可切换单阶段或双阶段，并设置是否自动开始 Q&A。独立计时时当前组显示 `N/A`。
- 放映前点**锁定**，菜单会收起，鼠标恢复穿透。托盘菜单可**移到最前**或**退出**。现场同时打开网页投影和悬浮窗时，可静音其中一个，避免同时响铃。

在已配对的在线网页控制台展开**桌面悬浮窗**，选择布局、预设位置或自定义偏移、尺寸和不透明度，再点**应用到悬浮窗**。跟随此服务器的各台 App 会以各自选定的屏幕为准，网页投影继续使用原来的布局。设置保存在服务器，App 连接时或老师再次应用设置时会同步。

表单改动会先反映在预览中。点**读取当前 App 参数**可用已连接 App 的实际位置、尺寸、布局、边缘和不透明度填回表单。多台 App 在线时可选择读取哪一台。读取只更新表单和预览，点**应用到悬浮窗**才会将设置发给跟随服务器的 App。

### 构建和验收

在 Windows x64 的 `app_JS_Electron` 目录中，用 Node.js 22.12 或更新版本执行上面的命令。`npm start` 启动开发版，用托盘菜单退出后再继续打包。首次运行或打包时会下载锁定版本的 Electron。`npm run package:win` 把 ZIP 写到 `dist/`，并把同级 `web/` 下的共享投影文件打进包里。

请在实际 PPT 放映环境验证幻灯片放映和演示者视图。把悬浮窗移到目标投影，锁定后测试鼠标穿透、键盘或翻页器翻页，以及老师远端切组。现场也要检查换屏、投影透明度和音频输出。目前免安装包面向 Windows x64。
