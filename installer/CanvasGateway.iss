#ifndef MyAppVersion
  #define MyAppVersion "1.1.0"
#endif
#ifndef StageDir
  #error StageDir must point to the staged Canvas Gateway files.
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

#define MyAppName "Canvas Gateway"
#define MyAppPublisher "tatsuki"
#define MyAppURL "https://github.com/Tatsuki12138/Canvas-ComfyUI-Remote"

[Setup]
AppId={{D4AEEBE7-5481-4801-9B2F-F74F4205F527}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={localappdata}\Programs\Canvas Gateway
DefaultGroupName=Canvas Gateway
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=Canvas-Gateway-Setup-v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupArchitecture=x64
MinVersion=10.0.17763
LicenseFile={#StageDir}\LICENSE
UninstallDisplayIcon={app}\gateway\CanvasGateway.exe
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Canvas ComfyUI Remote Gateway Installer
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[CustomMessages]
english.ComfyPageTitle=Locate ComfyUI
english.ComfyPageDescription=Select the folder that contains ComfyUI main.py.
english.ComfyPagePrompt=ComfyUI folder:
english.PythonPageTitle=Locate ComfyUI Python
english.PythonPageDescription=The installer normally detects the Python bundled with ComfyUI.
english.PythonPagePrompt=Python executable:
english.ProxyPageTitle=Optional proxy
english.ProxyPageDescription=Leave this blank unless Danbooru must use a proxy on this PC.
english.ProxyPagePrompt=Proxy URL (for example http://127.0.0.1:7890):
english.ExistingTitle=Existing Canvas data detected
english.ExistingDescription=Your current configuration and personal data will be preserved.
english.ExistingBody=Canvas found an existing configuration at:%n%n%1%n%nThe installer will update program files only. Prompts, settings, favorites, pairing state and logs will not be replaced. To change the ComfyUI path later, run "Configure Canvas Gateway" from the Start menu.
english.PrivacyTitle=Privacy and network behavior
english.PrivacyDescription=Review what the installer changes before continuing.
english.PrivacyBody=Canvas Gateway is installed for the current Windows user and listens on 127.0.0.1 only. Remote APP access is provided by your existing Tailscale private network. The installer does not enable Funnel, upload prompts or images, or install telemetry.%n%nPersonal data is stored separately in:%n%1%n%nUninstall keeps this directory unless you explicitly choose to delete it.
english.InvalidComfy=Select a ComfyUI folder that contains main.py.
english.InvalidPython=Select the Python executable used by this ComfyUI installation.
english.InvalidProxy=The proxy must be blank or start with http:// or https:// and must not contain quotes or line breaks.
english.ConfigFailed=Canvas configuration failed with exit code %1. Setup cannot continue safely.
english.DesktopTask=Create a desktop shortcut
english.AutoStartTask=Start Canvas Gateway with Windows (off by default)
english.LaunchControl=Open Canvas Control Center
english.OpenTailscale=Open the Tailscale download page
english.RemoveDataPrompt=Also permanently delete Canvas prompts, settings, favorites, pairing state and logs from:%n%n%1%n%nChoose No to keep them for a later reinstall.
english.ConfigureShortcut=Configure Canvas Gateway
english.ControlShortcut=Canvas Control Center
english.TailscaleMissing=Tailscale was not detected. Canvas can be installed now, but remote APP access requires Tailscale to be installed and signed in later.

chinesesimplified.ComfyPageTitle=选择 ComfyUI
chinesesimplified.ComfyPageDescription=请选择包含 ComfyUI main.py 的文件夹。
chinesesimplified.ComfyPagePrompt=ComfyUI 文件夹：
chinesesimplified.PythonPageTitle=选择 ComfyUI Python
chinesesimplified.PythonPageDescription=安装程序通常会自动识别 ComfyUI 整合包自带的 Python。
chinesesimplified.PythonPagePrompt=Python 可执行文件：
chinesesimplified.ProxyPageTitle=可选代理
chinesesimplified.ProxyPageDescription=只有电脑访问 Danbooru 需要代理时才填写，否则请留空。
chinesesimplified.ProxyPagePrompt=代理地址（例如 http://127.0.0.1:7890）：
chinesesimplified.ExistingTitle=检测到现有 Canvas 数据
chinesesimplified.ExistingDescription=当前配置和个人数据将被保留。
chinesesimplified.ExistingBody=Canvas 在以下位置发现了现有配置：%n%n%1%n%n安装程序只更新程序文件，不会覆盖提示词、设置、收藏、配对状态和日志。以后需要更换 ComfyUI 路径时，可从开始菜单运行“配置 Canvas Gateway”。
chinesesimplified.PrivacyTitle=隐私与网络行为
chinesesimplified.PrivacyDescription=继续前请确认安装程序会进行哪些操作。
chinesesimplified.PrivacyBody=Canvas Gateway 仅为当前 Windows 用户安装，并且只监听 127.0.0.1。手机 APP 通过你现有的 Tailscale 私有网络访问。安装程序不会启用 Funnel，不会上传提示词或图片，也不包含遥测。%n%n个人数据独立保存在：%n%1%n%n卸载时默认保留该目录，只有你明确选择后才会删除。
chinesesimplified.InvalidComfy=请选择包含 main.py 的 ComfyUI 文件夹。
chinesesimplified.InvalidPython=请选择该 ComfyUI 使用的 Python 可执行文件。
chinesesimplified.InvalidProxy=代理地址必须留空，或以 http://、https:// 开头，并且不能包含引号或换行。
chinesesimplified.ConfigFailed=Canvas 配置失败，退出代码为 %1。为了安全，安装无法继续。
chinesesimplified.DesktopTask=创建桌面快捷方式
chinesesimplified.AutoStartTask=随 Windows 启动 Canvas Gateway（默认关闭）
chinesesimplified.LaunchControl=打开 Canvas 控制中心
chinesesimplified.OpenTailscale=打开 Tailscale 下载页面
chinesesimplified.RemoveDataPrompt=是否同时永久删除以下目录中的 Canvas 提示词、设置、收藏、配对状态和日志？%n%n%1%n%n选择“否”可保留数据，以便以后重新安装。
chinesesimplified.ConfigureShortcut=配置 Canvas Gateway
chinesesimplified.ControlShortcut=Canvas 控制中心
chinesesimplified.TailscaleMissing=未检测到 Tailscale。现在仍可安装 Canvas，但手机远程访问需要之后安装并登录 Tailscale。

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopTask}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostart"; Description: "{cm:AutoStartTask}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{cm:ControlShortcut}"; Filename: "{app}\Canvas-Control-Center.cmd"; WorkingDir: "{app}"
Name: "{group}\{cm:ConfigureShortcut}"; Filename: "{app}\Configure-Canvas.cmd"; WorkingDir: "{app}"
Name: "{group}\Uninstall Canvas Gateway"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{cm:ControlShortcut}"; Filename: "{app}\Canvas-Control-Center.cmd"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{userstartup}\Canvas Gateway"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\start-gateway.ps1"""; WorkingDir: "{app}"; Tasks: autostart

[Run]
Filename: "{app}\Canvas-Control-Center.cmd"; Description: "{cm:LaunchControl}"; WorkingDir: "{app}"; Flags: postinstall nowait skipifsilent
Filename: "https://tailscale.com/download/windows"; Description: "{cm:OpenTailscale}"; Flags: postinstall shellexec skipifsilent unchecked; Check: not IsTailscaleInstalled

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\Switch-CanvasMode.ps1"" -Mode Stop"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated skipifdoesntexist; Check: CanStopCanvas; RunOnceId: "StopCanvasGateway"

[Code]
var
  ComfyPage: TInputDirWizardPage;
  PythonPage: TInputFileWizardPage;
  ProxyPage: TInputQueryWizardPage;
  ExistingPage: TOutputMsgWizardPage;
  PrivacyPage: TOutputMsgMemoWizardPage;
  ExistingConfig: Boolean;
  DeleteUserData: Boolean;

function CanvasDataDir: String;
var
  OverrideDir: String;
begin
  { CANVAS_DATA_DIR exists solely to isolate automated installer tests.  Never
    let an ordinary inherited environment variable redirect uninstall cleanup. }
  OverrideDir := '';
  if GetEnv('CANVAS_INSTALLER_TEST') = '1' then
    OverrideDir := GetEnv('CANVAS_DATA_DIR');
  if OverrideDir <> '' then
    Result := ExpandFileName(OverrideDir)
  else
    Result := ExpandConstant('{userappdata}\CanvasGateway');
end;

function CanvasConfigPath: String;
begin
  Result := AddBackslash(CanvasDataDir) + 'config.json';
end;

function IsTailscaleInstalled: Boolean;
begin
  Result := FileExists(ExpandConstant('{pf}\Tailscale\tailscale.exe')) or
    FileExists(ExpandConstant('{localappdata}\Tailscale\tailscale.exe')) or
    FileExists(ExpandConstant('{userappdata}\Tailscale\tailscale.exe'));
end;

function CanStopCanvas: Boolean;
begin
  Result := (GetEnv('CANVAS_INSTALLER_TEST') <> '1') and
    FileExists(ExpandConstant('{app}\scripts\Switch-CanvasMode.ps1'));
end;

function DetectComfyPython(const ComfyDir: String): String;
var
  ParentDir: String;
  Candidate: String;
begin
  Result := '';
  ParentDir := ExtractFileDir(RemoveBackslashUnlessRoot(ComfyDir));
  Candidate := AddBackslash(ParentDir) + 'python\python.exe';
  if FileExists(Candidate) then begin Result := Candidate; Exit; end;
  Candidate := AddBackslash(ParentDir) + 'python_embeded\python.exe';
  if FileExists(Candidate) then begin Result := Candidate; Exit; end;
  Candidate := AddBackslash(ComfyDir) + 'python_embeded\python.exe';
  if FileExists(Candidate) then begin Result := Candidate; Exit; end;
  Candidate := AddBackslash(ComfyDir) + 'venv\Scripts\python.exe';
  if FileExists(Candidate) then begin Result := Candidate; Exit; end;
  Candidate := AddBackslash(ComfyDir) + '.venv\Scripts\python.exe';
  if FileExists(Candidate) then begin Result := Candidate; Exit; end;
end;

function ValidateProxy(const Value: String): Boolean;
var
  LowerValue: String;
  I: Integer;
begin
  if Value = '' then begin Result := True; Exit; end;
  LowerValue := Lowercase(Value);
  Result := ((Pos('http://', LowerValue) = 1) or (Pos('https://', LowerValue) = 1)) and
    (Pos('"', Value) = 0) and (Pos('`', Value) = 0) and (Pos('$', Value) = 0) and
    (Pos(#13, Value) = 0) and (Pos(#10, Value) = 0);
  if Result then
    for I := 1 to Length(Value) do
      if Pos(Value[I], 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/?&=._-%@[]+') = 0 then begin
        Result := False;
        Exit;
      end;
end;

function IsSafePowerShellArgument(const Value: String): Boolean;
begin
  Result := (Pos('"', Value) = 0) and (Pos('`', Value) = 0) and
    (Pos('$', Value) = 0) and (Pos(#13, Value) = 0) and (Pos(#10, Value) = 0);
end;

procedure InitializeWizard;
var
  ComfyParam: String;
  PythonParam: String;
begin
  ExistingConfig := FileExists(CanvasConfigPath);

  ExistingPage := CreateOutputMsgPage(wpSelectDir,
    CustomMessage('ExistingTitle'), CustomMessage('ExistingDescription'),
    FmtMessage(CustomMessage('ExistingBody'), [CanvasConfigPath]));

  ComfyPage := CreateInputDirPage(ExistingPage.ID,
    CustomMessage('ComfyPageTitle'), CustomMessage('ComfyPageDescription'),
    CustomMessage('ComfyPagePrompt'), False, '');
  ComfyPage.Add(CustomMessage('ComfyPagePrompt'));
  ComfyParam := ExpandConstant('{param:COMFYUIPATH|}');
  if ComfyParam <> '' then ComfyPage.Values[0] := ComfyParam;

  PythonPage := CreateInputFilePage(ComfyPage.ID,
    CustomMessage('PythonPageTitle'), CustomMessage('PythonPageDescription'),
    CustomMessage('PythonPagePrompt'));
  PythonPage.Add(CustomMessage('PythonPagePrompt'), 'Python executable|python.exe|Executable files|*.exe|All files|*.*', '.exe');
  PythonParam := ExpandConstant('{param:COMFYPYTHON|}');
  if PythonParam <> '' then PythonPage.Values[0] := PythonParam;

  ProxyPage := CreateInputQueryPage(PythonPage.ID,
    CustomMessage('ProxyPageTitle'), CustomMessage('ProxyPageDescription'), '');
  ProxyPage.Add(CustomMessage('ProxyPagePrompt'), False);
  ProxyPage.Values[0] := ExpandConstant('{param:PROXYURL|}');

  PrivacyPage := CreateOutputMsgMemoPage(ProxyPage.ID,
    CustomMessage('PrivacyTitle'), CustomMessage('PrivacyDescription'), '',
    FmtMessage(CustomMessage('PrivacyBody'), [CanvasDataDir]));
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if ExistingConfig then begin
    if (PageID = ComfyPage.ID) or (PageID = PythonPage.ID) or (PageID = ProxyPage.ID) then
      Result := True;
  end else if PageID = ExistingPage.ID then
    Result := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  DetectedPython: String;
begin
  Result := True;
  if CurPageID = ComfyPage.ID then begin
    if (not IsSafePowerShellArgument(ComfyPage.Values[0])) or
       (not FileExists(AddBackslash(ComfyPage.Values[0]) + 'main.py')) then begin
      MsgBox(CustomMessage('InvalidComfy'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if PythonPage.Values[0] = '' then begin
      DetectedPython := DetectComfyPython(ComfyPage.Values[0]);
      if DetectedPython <> '' then PythonPage.Values[0] := DetectedPython;
    end;
  end else if CurPageID = PythonPage.ID then begin
    if (not IsSafePowerShellArgument(PythonPage.Values[0])) or
       (not FileExists(PythonPage.Values[0])) then begin
      MsgBox(CustomMessage('InvalidPython'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end else if CurPageID = ProxyPage.ID then begin
    if not ValidateProxy(Trim(ProxyPage.Values[0])) then begin
      MsgBox(CustomMessage('InvalidProxy'), mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not ExistingConfig then begin
    if (not IsSafePowerShellArgument(ComfyPage.Values[0])) or
       (not FileExists(AddBackslash(ComfyPage.Values[0]) + 'main.py')) then begin
      Result := CustomMessage('InvalidComfy');
      Exit;
    end;
    if (not IsSafePowerShellArgument(PythonPage.Values[0])) or
       (not FileExists(PythonPage.Values[0])) then begin
      Result := CustomMessage('InvalidPython');
      Exit;
    end;
    if not ValidateProxy(Trim(ProxyPage.Values[0])) then
      Result := CustomMessage('InvalidProxy');
  end;
end;

procedure ConfigureCanvas;
var
  PowerShellPath: String;
  ScriptPath: String;
  Params: String;
  ResultCode: Integer;
begin
  if ExistingConfig then Exit;

  PowerShellPath := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  ScriptPath := ExpandConstant('{app}\scripts\Configure-Canvas.ps1');
  Params := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' + AddQuotes(ScriptPath) +
    ' -ComfyUIPath ' + AddQuotes(ComfyPage.Values[0]) +
    ' -ComfyPython ' + AddQuotes(PythonPage.Values[0]);
  if Trim(ProxyPage.Values[0]) <> '' then
    Params := Params + ' -ProxyUrl ' + AddQuotes(Trim(ProxyPage.Values[0]));

  if not Exec(PowerShellPath, Params, ExpandConstant('{app}'), SW_HIDE,
    ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
    RaiseException(FmtMessage(CustomMessage('ConfigFailed'), [IntToStr(ResultCode)]));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then ConfigureCanvas;
end;

function InitializeUninstall: Boolean;
begin
  DeleteUserData := False;
  if not UninstallSilent then
    DeleteUserData := MsgBox(
      FmtMessage(CustomMessage('RemoveDataPrompt'), [CanvasDataDir]),
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if (CurUninstallStep = usPostUninstall) and DeleteUserData then begin
    DataDir := CanvasDataDir;
    if (DataDir <> '') and (CompareText(DataDir, ExpandConstant('{userappdata}')) <> 0) then
      DelTree(DataDir, True, True, True);
  end;
end;
