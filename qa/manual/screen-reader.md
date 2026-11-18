# 怎么去? — screen-reader check (M5 AC 15) / 读屏检查

For the owner. About 20 minutes per phone: **TalkBack** (Android, Chrome) and **VoiceOver** (iPhone, Safari).
Use the installed app (home-screen icon). Fill the table at the end: **pass**, **problem** or a short **note**.
QA triages every problem like a gate bug (S1–S4). Do not write anyone's name, phone number or address in the notes.

给车主用。每部手机约 20 分钟：Android 用 **TalkBack**（Chrome），iPhone 用 **VoiceOver**（Safari）。
请从桌面图标打开已安装的应用。最后在表格里写：**通过**、**有问题** 或简短 **备注**。不要写任何人的名字、电话或地址。

## Turn it on / 打开读屏
- Android: Settings → Accessibility → TalkBack → On. Swipe right = next item, double-tap = press.
  安卓：设置 → 无障碍 → TalkBack → 打开。向右滑 = 下一项，点两下 = 按。
- iPhone: Settings → Accessibility → VoiceOver → On. Swipe right = next item, double-tap = press.
  iPhone：设置 → 辅助功能 → 旁白 → 打开。向右滑 = 下一项，点两下 = 按。
- Set the app to 中文 first (Settings → 语言). Repeat steps 2 and 4 once in English at the end.
  先把应用设成中文。最后用英文再做一次第 2 和第 4 步。

## Steps / 步骤
1. **Home.** Swipe through every item. Each button says a clear name (e.g. "去哪里？ 搜索", "回家"), never just "button", never English in Chinese mode.
   **首页。** 一项一项滑过去。每个按钮都要读出清楚的名字，不能只读“按钮”，中文模式里不能读英文。
2. **Search.** Open search, type "医院", pick the first result, open the first route. Swipe through the steps: each step is read once, in order.
   **搜索。** 搜“医院”，选第一个结果，打开第一条路线。一步一步滑过去：每一步读一次，顺序正确。
3. **Headings.** On each screen, use the headings rotor (iPhone) or headings navigation (Android): the screen title comes first.
   **标题。** 每个页面用“标题”导航：第一个是页面标题。
4. **Start the trip.** Press 开始. Listen for 30 seconds: the step is read once; the stops countdown is **not** read every few seconds (only at 3, 2, 1 and "now").
   **开始行程。** 按“开始”。听 30 秒：这一步只读一次；剩几站**不会**每几秒读一次（只在 3、2、1 站和“现在下车”时读）。
5. **Get-off alert.** Settings → 示范 (demo replay) until "下一站下车". The alert is read **at once**, even in the middle of another sentence.
   **下车提醒。** 用示范回放到“下一站下车”。提醒要**马上**读出来，就算正在读别的句子。
6. **Help and Share.** Open 帮助, then close it: you are back on the 帮助 button. Open 分享, close it: back on 分享.
   **帮助和分享。** 打开“帮助”再关掉：回到“帮助”按钮上。打开“分享”再关掉：回到“分享”。
7. **Back (Android only).** Use the back gesture on every screen: it goes back one step, never out of the app from inside a trip.
   **返回（只限安卓）。** 每个页面用返回手势：只退一步，行程中不会直接退出应用。
8. **New M5 pages.** Settings → 隐私说明: headings read in order; Settings → 省电模式 sheet: the three choices say which one is selected; the update bar (if shown) says "有新版本，按一下更新".
   **M5 新页面。** 设置 → 隐私说明：标题按顺序读；省电模式：三个选项读出哪一个选中；更新条（如果有）读“有新版本，按一下更新”。
9. Turn the screen reader off. Note the time it took and anything confusing.
   关掉读屏。记下用了多久，和觉得不清楚的地方。

## Results / 结果

| # | Step | TalkBack (Android) | VoiceOver (iPhone) | Note |
|---|---|---|---|---|
| 1 | Home names | | | |
| 2 | Search → route steps | | | |
| 3 | Headings | | | |
| 4 | Trip: read once, no countdown chatter | | | |
| 5 | Get-off alert at once | | | |
| 6 | Help / Share focus returns | | | |
| 7 | Back gesture | — | | |
| 8 | Privacy, battery saver, update bar | | | |
| 9 | Time taken, confusing parts | | | |

Phone model and OS version (no serial numbers): ______ · App version (Settings → 关于): ______ · Date: ______
