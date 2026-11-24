# Countdown Timer · 倒计时

A countdown timer you can configure and control remotely. 一个可远程设置和控制的倒计时。

[Open the bilingual HTML guide · 打开双语网页版使用说明](web/guide.html)

[Single- and two-stage projection · 单阶段与双阶段投影](web/display.html)

[Clock · 时钟](web/clock.html) can open directly or at `/clock` on the server. Choose device time, the countdown server’s time, or both. 主钟默认使用电脑时区，支持字号调整和多城市显示。

The console is at `/` and the read-only projection is at `/display`. The interface opens in English. Select **CN/EN** to switch languages. The backend needs Python 3.10+ and uses only the standard library. Browser clients need no installation.

## English

### Use it without a server

Keep the `web` folder together and double-click `web/console.html`. The same console opens in **Offline** mode. It supports the countdown, group queue, settings, and fullscreen without Python or an internet connection. Use **Open projection** for a separate window in the same browser, or **Fullscreen** in the timer panel to project from the current window. Keep the console open while using a separate projection. The projection plays the saved finish sound. Clicking **Fullscreen** also enables audio when the browser requires a gesture.

The **Switch to Offline** button also works in an already-open server page. If the server is unreachable, use the timer panel’s **Fullscreen** button or open the local HTML files so a separate projection can load. On its first use on that server address, the browser’s offline queue starts with the latest received online queue and settings. Later offline changes stay in browser storage. Use export and import to transfer changes between modes or computers. Use **Switch to Online** for server-based control from another computer.

For a local timer, double-click `web/display.html`, or click **Standalone timer** on `/display`. Use **Use two stages** or **Use one stage** as needed. Enter the duration and save it before starting. In **Follow console** mode, the same display shows the mode chosen in the console.

### 1. Public server (default)

Copy `server.py`, `timer_state.py`, and `web/` to the host. Use one Python process per event and put the data file on a persistent writable disk. With an existing Nginx HTTPS virtual host, run:

```sh
python3 server.py --public-url https://timer.example.edu
```

Add this to the HTTPS virtual host. The proxy forwards the countdown’s live event stream as it arrives.

```nginx
location / {
    proxy_pass http://127.0.0.1:8765;
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 30s;
    client_max_body_size 384k;
}
```

Keep port 8765 bound to loopback when using an HTTPS proxy. Set `--public-url` to the browser-facing HTTPS origin, which includes the scheme, host, and any non-default port. See the [Nginx proxy documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering).

To publish under an existing site such as `https://example.edu/timer/`, start Python with `--public-url https://example.edu` and use the existing-site example in the [HTML guide](web/guide.html). Enter the full URL including `/timer/` in the browser or Windows launcher.

`COUNTDOWN_PUBLIC_URL` is optional. On the server it supplies the default origin for `--public-url`. An explicit argument takes precedence. On a Windows client, it supplies the full console URL for `start.bat`, including a subpath if used. In the guide's direct HTTP example, `env -u COUNTDOWN_PUBLIC_URL` unsets it for that invocation only.

For a small, access-restricted installation with an existing TLS certificate, the same single process can terminate HTTPS directly. Use a valid full chain and key. In this configuration, open the chosen HTTPS port to your participants. For a generally reachable internet deployment, use the proxy setup above. [Python HTTP server documentation](https://docs.python.org/3/library/http.server.html).

```sh
python3 server.py --host 0.0.0.0 --port 8443 \
  --public-url https://timer.example.edu:8443 --cert fullchain.pem --key privkey.pem
```

Give the teacher the HTTPS console URL and the pairing code printed in the host terminal or service logs. The server generates a fresh code by default, and existing pairing tokens expire on every restart. To choose the code for a launch, append `--pairing-code RoomTimer2026` to either the public or LAN server command. Use 6–32 letters or digits. Pairing is case-insensitive. Anybody with access to this installation can read the queue and timer, so use display names appropriate for your audience. In Windows, double-click `start.bat` and enter the public URL. To skip the prompt, run `set "COUNTDOWN_PUBLIC_URL=https://timer.example.edu"` and then `start.bat` in the same Command Prompt.

#### Automatic shutdown

```sh
python3 server.py --public-url https://timer.example.edu --run-for 2h30m
python server.py --lan --open --run-for 45m
python server.py --help
```

`--run-for` accepts a positive whole number of seconds, such as `90` or `90s`, or combined hours, minutes, and seconds in that order, such as `2h30m` or `1m15s`. Run it on the machine hosting Python. The limit starts when the service is ready and counts idle time. At expiry the process logs the stop, closes its connections, and exits with status `0`, even if a group is still timing. The queue and saved settings remain on disk. After a restart the timer is ready to start again. Without this option the service runs until manually stopped. Configure an external process manager to leave successful exits stopped if you want the limit to persist.

### 2. Projection and sound

1. Set Windows to **Extend** with **Win+P**. Keep the student’s presentation on its own output. Use **Open projection** on the venue computer in a separate Edge or Chrome window. The regular projection plays the saved finish sound by default.
2. Drag the window onto the countdown projector, or use **Win+Shift+Left/Right** to move it. Choose the correct Windows audio output, then click **Fullscreen**, which also enables sound when the browser requires a click. **Enable sound** is available if your browser needs it. **Esc** exits browser fullscreen.
3. The teacher can select **Preview on projection** to audition the sound chosen in the settings form. **Save settings** applies it to subsequent finishes. Choose **Mute** or set volume to **0** for silent timing. Refreshing or reconnecting never replays a past finish.
4. An empty queue can start at **N/A**. To use groups, paste one name per line, select a group, and click **Set as current**. Use **Batch edit** for staged reordering and deletion, then apply the changes together. **Copy queue** copies the saved order as one name per line. A new default duration applies on the next reset or group switch if a session is underway.

### 3. Windows LAN backup

- Before the event, export queue and settings from the public console. On the venue computer, double-click `start.bat` and enter **L**, or run `start.bat lan`. LAN mode requires Python 3.10+ on that computer. The script opens the local console and prints the teacher’s LAN address and pairing code. Use the new code to pair both consoles, import the backup, and open the LAN projection. The two servers keep separate copies. Import starts the selected group in the ready state.
- On the venue computer, allow inbound **TCP 8765** (or your `COUNTDOWN_PORT`) on the trusted Windows network profile, scoped to the teacher’s address or local subnet. The local console remains available at `http://127.0.0.1:8765`. Keep the service window open. For a port collision, close the competing service or set a different port, for example `set COUNTDOWN_PORT=8766` in Command Prompt before running `start.bat lan`.
- If the teacher can’t connect, check the printed URL against the physical Wi-Fi/Ethernet IPv4 address in `ipconfig`. Ensure the console works on the venue machine, then run `Test-NetConnection <venue-IPv4> -Port 8765` in PowerShell on the teacher’s computer. If `TcpTestSucceeded` is false, check the firewall rule and address. If those are correct, the campus network may isolate clients. Use a permitted shared hotspot, wired network, or the venue’s local console.
- Public mode saves to `data/public.json`. LAN mode saves to `data/lan.json` on the venue machine. Use `--data PATH` to choose another file. A closed or disconnected controller does not stop the server timer. A process restart restores the queue, selection, and settings and initializes the timer to **Ready**.

## 中文

### 直接打开 HTML

保留完整的 `web` 文件夹，双击 `web/console.html`。同一个控制台会进入**离线模式**，无需启动 Python 或联网。支持倒计时、队列、设置和全屏。点**打开投影页**可在同一浏览器新开一个窗口，也可在计时区点**全屏**直接展示。使用独立投影窗口时请保持控制台打开。投影默认播放到时铃声，点**全屏**可同时解锁浏览器音频。

服务器页面已经打开时，点**切换到离线模式**也能继续使用本机计时。如果服务器已失联，可用计时区的**全屏**，或打开本地 HTML 来加载独立投影窗口。同一服务器地址首次启用离线时，会采用浏览器最近收到的队列和设置。之后离线修改保存在浏览器里，需要带回在线模式或换电脑时可导出和导入。跨电脑控制请切到在线模式。

要独立计时，可双击 `web/display.html`，或在 `/display` 点击**独立计时**，按需切换单阶段或双阶段，再设置时长。点**跟随控制台**可回到同步投影，由控制台决定阶段模式。

### 1. 公共服务器（默认）

把 `server.py`、`timer_state.py` 和 `web/` 复制到服务器，安装 Python 3.10 或更新版本即可，无需 pip 或 npm 安装。已有 Nginx HTTPS 站点时，按上面的命令启动 Python，并把示例 `location /` 加入该站点。Python 默认只监听 `127.0.0.1:8765`。`--public-url` 填实际 HTTPS 地址。已有有效证书的小范围部署也可以用上面的单进程 HTTPS 命令。每个活动只运行一个服务进程，数据文件放在可持久保存的磁盘。

如果要挂在已有网站的 `https://example.edu/timer/`，使用 `--public-url https://example.edu` 启动 Python，再按 [HTML 指南](web/guide.html)里的「在已有网站下挂载 /timer/」示例加入两个 `location`。浏览器和 Windows 启动脚本填写含 `/timer/` 的完整地址。

`COUNTDOWN_PUBLIC_URL` 是可选的环境变量。在服务端，它提供 `--public-url` 的默认来源地址，两者同时设置时以命令行参数为准。在 Windows 客户端，它告诉 `start.bat` 打开哪个完整控制台地址，地址可以包含子路径。网页指南的 HTTP 直连示例用 `env -u COUNTDOWN_PUBLIC_URL` 仅为当次启动取消该变量。

老师打开 HTTPS 地址，输入服务窗口或日志显示的配对码。重启服务后重新配对。能访问该站点的人可查看组名和计时。Windows 上双击 `start.bat`，输入公共 HTTPS 地址即可打开控制台。希望跳过输入提示时，在同一个命令提示符里先执行 `set "COUNTDOWN_PUBLIC_URL=https://timer.example.edu"`，再运行 `start.bat`。界面默认英语，点 **CN/EN** 切换。

公共服务器和局域网启动命令都可追加 `--pairing-code RoomTimer2026` 手动指定配对码。使用 6–32 位英文字母或数字，配对时不区分大小写。省略参数时，服务每次启动都会随机生成配对码。

#### 限时运行并自动退出

```sh
python3 server.py --public-url https://timer.example.edu --run-for 2h30m
python server.py --lan --open --run-for 45m
python server.py --help
```

在运行 Python 的服务器或现场机上使用 `--run-for`。支持正整数秒，例如 `90` 或 `90s`，也支持按小时、分钟、秒顺序组合，例如 `2h30m` 或 `1m15s`。从服务就绪时开始计时，空闲时间也计入。到期会记录退出日志、关闭连接并以状态码 `0` 退出，即使某组正在计时。已保存的队列和设置保留，再启动时计时器处于待开始状态。省略此参数会持续运行，直到手动停止。若使用进程管理器，请避免让它在正常退出后立即重启服务。

### 2. 双屏投影与声音

1. 在现场按 **Win+P** 选择**扩展**，学生演讲继续使用原来的屏幕。现场电脑使用独立的 Edge 或 Chrome 窗口**打开投影页**。普通投影页默认播放设置中的到时铃声。
2. 将窗口拖到倒计时投影，或按 **Win+Shift+左／右方向键**移动。确认 Windows 音频输出后点**全屏**。浏览器要求先点击页面时，这一步也会启用声音。也可以点投影页的**启用声音**。按 **Esc** 退出。
3. 老师可用**在投影端试听**播放设置表单里选中的铃声。保存后会应用到后续归零。选择**静音**或把音量调至 **0** 可安静计时。刷新或断线重连都不会补播已经发生的铃声。
4. 空队列也能用 **N/A** 开始计时。需要小组时，每行粘贴一个组名，选中后点**设为当前**。用**批量编辑**暂存排序或删除，再点**应用更改**。点**复制当前队列**可按已生效的顺序复制组名，每行一个。计时中改默认时长，会在下次重置或切组时生效。

### 3. Windows 局域网备用

- 活动前从公共控制台导出队列和设置。现场双击 `start.bat` 后输入 **L**，或运行 `start.bat lan`。现场机需要 Python 3.10+。脚本自动打开本机控制台，窗口显示教师的局域网地址和新配对码。两端重新配对后导入备份，再打开局域网投影页。两套服务各自保存数据，导入后从待开始状态接手。
- Windows 防火墙仅在可信网络配置文件上允许入站 **TCP 8765**（或设置的 `COUNTDOWN_PORT`），可将范围限于教师电脑 IP 或本地子网。本机用 `http://127.0.0.1:8765`。保持服务窗口开启。端口冲突时关闭占用程序，或先在命令提示符执行 `set COUNTDOWN_PORT=8766` 再启动。
- 教师端无法连接时，用 `ipconfig` 核对现场机实际网卡的 IPv4。在现场机确认控制台能打开后，从教师机运行 PowerShell 命令 `Test-NetConnection <现场机IPv4> -Port 8765`。如果 `TcpTestSucceeded` 为假，先检查地址和防火墙。两项均正确时，校园网可能隔离了设备。可使用允许互通的热点、有线网络，或改用现场控制台。
- 公共服务把数据保存至服务器的 `data/public.json`，局域网服务保存至现场机的 `data/lan.json`。可用 `--data PATH` 自定义路径。教师端断线时，服务仍继续计时。服务进程重启后会恢复队列、当前组和设置，并回到待开始。

## Tests · 测试

```sh
python -m unittest -v
```

The suite uses the loopback network and temporary data files. Venue acceptance covers both physical projectors, fullscreen focus while the student operates another app, real speaker volume and one audible finish chime, and connectivity across the actual campus network.

测试通过本机回环网络和临时数据运行。现场验收包括双投影、学生操作其他应用时倒计时全屏及焦点是否正常、现场音量和归零铃声是否只听到一次，以及实际校园网互通。
