; Bộ cài AI-SRM trên PC (Inno Setup 6). Build:
;   ISCC.exe /DNguon="<thư mục Bo_cai_AI-SRM_PC_v1.0.1>" /O"<thư mục ra>" AI-SRM_PC.iss
; Không cần quyền quản trị; chỉ bước mở cổng LAN (tùy chọn) xin quyền quản trị.

#define PhienBan "1.0.1"
#ifndef Nguon
  #define Nguon "..\..\..\Bo_cai_AI-SRM_PC_v1.0.1"
#endif

[Setup]
AppId={{6F0D6C2B-2B7E-4C55-9A0E-4153524D5043}
AppName=AI-SRM (bản tập huấn trên PC)
AppVersion={#PhienBan}
AppVerName=AI-SRM {#PhienBan} (bản tập huấn trên PC)
AppPublisher=AI-SRM
DefaultDirName={autopf}\AI-SRM
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=AI-SRM_PC_Setup_v{#PhienBan}
SetupIconFile=aisrm.ico
UninstallDisplayIcon={app}\he-thong\aisrm.ico
UninstallDisplayName=AI-SRM {#PhienBan} (bản tập huấn trên PC)
WizardStyle=modern
Compression=lzma2/normal
SolidCompression=no
InfoBeforeFile=truoc-khi-cai.txt
CloseApplications=no

[Languages]
Name: "vi"; MessagesFile: "compiler:Default.isl"

[Messages]
SetupAppTitle=Cài đặt
SetupWindowTitle=Cài đặt %1
UninstallAppTitle=Gỡ cài đặt
UninstallAppFullTitle=Gỡ %1
ButtonBack=< &Quay lại
ButtonNext=&Tiếp >
ButtonInstall=&Cài đặt
ButtonOK=Đồng ý
ButtonCancel=Hủy
ButtonYes=&Có
ButtonYesToAll=Có &tất cả
ButtonNo=&Không
ButtonNoToAll=K&hông tất cả
ButtonFinish=&Xong
ButtonBrowse=&Chọn...
ButtonWizardBrowse=C&họn...
ExitSetupTitle=Thoát cài đặt
ExitSetupMessage=Chưa cài xong. Nếu thoát bây giờ, AI-SRM sẽ không được cài.%n%nThoát cài đặt?
WelcomeLabel1=Cài đặt [name]
WelcomeLabel2=Bộ cài sẽ cài [name/ver] lên máy tính này.%n%nNên đóng các chương trình khác trước khi tiếp tục.
WizardInfoBefore=Thông tin
InfoBeforeLabel=Đọc các thông tin sau trước khi cài.
InfoBeforeClickLabel=Sẵn sàng thì bấm Tiếp.
WizardSelectDir=Chọn thư mục cài
SelectDirDesc=Cài [name] vào đâu?
SelectDirLabel3=Bộ cài sẽ cài [name] vào thư mục sau.
SelectDirBrowseLabel=Bấm Tiếp để tiếp tục. Muốn chọn thư mục khác, bấm Chọn.
DiskSpaceGBLabel=Cần ít nhất [gb] GB ổ đĩa trống.
DiskSpaceMBLabel=Cần ít nhất [mb] MB ổ đĩa trống.
WizardSelectTasks=Chọn tùy chọn
SelectTasksDesc=Chọn các việc bộ cài sẽ làm thêm.
SelectTasksLabel2=Chọn các việc cần làm khi cài [name], rồi bấm Tiếp.
WizardReady=Sẵn sàng cài
ReadyLabel1=Bộ cài đã sẵn sàng cài [name].
ReadyLabel2a=Bấm Cài đặt để bắt đầu, hoặc Quay lại để xem / đổi lựa chọn.
ReadyLabel2b=Bấm Cài đặt để bắt đầu.
ReadyMemoDir=Thư mục cài:
ReadyMemoTasks=Tùy chọn:
WizardPreparing=Đang chuẩn bị
WizardInstalling=Đang cài đặt
InstallingLabel=Đang cài [name], vui lòng chờ...
StatusExtractFiles=Đang chép tệp...
StatusCreateIcons=Đang tạo biểu tượng...
StatusRunProgram=Đang hoàn tất cài đặt...
StatusSavingUninstall=Đang lưu thông tin gỡ cài đặt...
FinishedHeadingLabel=Đã cài xong [name]
FinishedLabelNoIcons=Đã cài [name] lên máy.
FinishedLabel=Đã cài [name] lên máy. Mở bằng biểu tượng "AI-SRM" trên màn hình hoặc trong Start menu.
ClickFinish=Bấm Xong để đóng bộ cài.
ConfirmUninstall=Gỡ %1 sẽ XÓA toàn bộ dữ liệu trong bản cài (đề tài, tài khoản, tệp đã tải lên). Cần giữ lại thì bấm Không, chạy "Sao lưu AI-SRM" trước.%n%nTiếp tục gỡ?
UninstallStatusLabel=Đang gỡ %1, vui lòng chờ...
UninstalledAll=Đã gỡ %1. Thư mục sao lưu (nếu có) được giữ lại.
UninstalledMost=Đã gỡ %1. Một số tệp không xóa được, có thể xóa bằng tay.

[CustomMessages]
AdditionalIcons=Biểu tượng:
CreateDesktopIcon=Tạo biểu tượng trên &màn hình
MoAISRM=Mở AI-SRM trên trình duyệt
XemTaiKhoan=Xem danh sách tài khoản mẫu
TaskLan=Cho máy khác trong mạng LAN truy cập (mở cổng tường lửa, cần quyền quản trị)
NhomMang=Mạng:
DangCai=Đang cài AI-SRM: nạp phần mềm, dữ liệu mẫu, nối LocalAI (3–5 phút; xem cửa sổ đen)...
DangMoLan=Đang mở cổng tường lửa cho mạng LAN...
CaiLoi=Chép tệp xong nhưng bước cài đặt AI-SRM chưa thành công (xem thông báo trong cửa sổ đen).%nSửa theo thông báo (thường là: mở Docker Desktop / gỡ bản cài cũ), rồi chạy lại bộ cài.%nNhật ký cài đặt:
LanLoi=Chưa mở được cổng LAN (chưa cho phép quyền quản trị). Muốn mở sau: Start menu → AI-SRM → Mở cổng mạng LAN.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "lan"; Description: "{cm:TaskLan}"; GroupDescription: "{cm:NhomMang}"

[Files]
Source: "{#Nguon}\*"; DestDir: "{app}"; Excludes: "\he-thong\.env,\he-thong\sao-luu,\he-thong\images\*,\he-thong\cai-dat.log,\he-thong\lan.on"; Flags: recursesubdirs ignoreversion
Source: "{#Nguon}\he-thong\images\*"; DestDir: "{app}\he-thong\images"; Flags: ignoreversion nocompression
Source: "aisrm.ico"; DestDir: "{app}\he-thong"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\AI-SRM\Mở AI-SRM"; Filename: "{app}\MO_AI-SRM.bat"; WorkingDir: "{app}"; IconFilename: "{app}\he-thong\aisrm.ico"
Name: "{autoprograms}\AI-SRM\Tắt AI-SRM"; Filename: "{app}\TAT_AI-SRM.bat"; WorkingDir: "{app}"
Name: "{autoprograms}\AI-SRM\Kiểm tra AI-SRM"; Filename: "{app}\KIEM_TRA.bat"; WorkingDir: "{app}"
Name: "{autoprograms}\AI-SRM\Cấu hình AI nội bộ"; Filename: "{app}\CAU_HINH_AI.bat"; WorkingDir: "{app}"
Name: "{autoprograms}\AI-SRM\Sao lưu AI-SRM"; Filename: "{app}\SAO_LUU.bat"; WorkingDir: "{app}"
Name: "{autoprograms}\AI-SRM\Mở cổng mạng LAN"; Filename: "{app}\MO_MANG_LAN.bat"; WorkingDir: "{app}"
Name: "{autoprograms}\AI-SRM\Hướng dẫn cài trên PC"; Filename: "{app}\HUONG_DAN_CAI_TREN_PC.docx"
Name: "{autoprograms}\AI-SRM\Tài liệu tập huấn"; Filename: "{app}\tai-lieu"
Name: "{autoprograms}\AI-SRM\Gỡ AI-SRM"; Filename: "{uninstallexe}"
Name: "{autodesktop}\AI-SRM"; Filename: "{app}\MO_AI-SRM.bat"; WorkingDir: "{app}"; IconFilename: "{app}\he-thong\aisrm.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\MO_AI-SRM.bat"; WorkingDir: "{app}"; Description: "{cm:MoAISRM}"; Flags: postinstall shellexec nowait skipifsilent
Filename: "{app}\TAI_KHOAN_MAU.txt"; Description: "{cm:XemTaiKhoan}"; Flags: postinstall shellexec nowait skipifsilent skipifdoesntexist

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\he-thong\go-cai-dat.ps1"" -DongY"; WorkingDir: "{app}\he-thong"; RunOnceId: "GoAISRM"; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: files; Name: "{app}\he-thong\.env"
Type: files; Name: "{app}\he-thong\lan.on"
Type: files; Name: "{app}\he-thong\cai-dat.log"
Type: files; Name: "{app}\TAI_KHOAN_MAU.txt"

[Code]
function UrlOk(const Url: string): Boolean;
var W: Variant;
begin
  Result := False;
  try
    W := CreateOleObject('WinHttp.WinHttpRequest.5.1');
    W.SetTimeouts(3000, 3000, 3000, 5000);
    W.Open('GET', Url, False);
    W.Send('');
    Result := (W.Status = 200);
  except
    Result := False;
  end;
end;

function CoDocker: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonpf64}\Docker\Docker\resources\bin\docker.exe'))
    or (FileSearch('docker.exe', GetEnv('PATH')) <> '');
end;

function InitializeSetup: Boolean;
begin
  Result := True;
  if not CoDocker then begin
    SuppressibleMsgBox('Máy chưa cài Docker Desktop.' + #13#10#13#10 +
      'Cài Docker Desktop (docker.com/products/docker-desktop), khởi động lại máy, mở Docker Desktop rồi chạy lại bộ cài này.',
      mbCriticalError, MB_OK, IDOK);
    Result := False;
    exit;
  end;
  if not (UrlOk('http://localhost:8080/v1/models') or UrlOk('http://localhost:11434/v1/models')) then
    Result := SuppressibleMsgBox('Không thấy LocalAI đang chạy trên máy (http://localhost:8080).' + #13#10#13#10 +
      'Nên mở Docker Desktop, chờ LocalAI chạy rồi cài lại (bấm Không).' + #13#10 +
      'Bấm Có để vẫn cài: AI-SRM dùng AI giả lập; bật AI nội bộ sau bằng "Cấu hình AI nội bộ".',
      mbConfirmation, MB_YESNO, IDYES) = IDYES;
end;

// Sau khi chép tệp: chạy CAI_DAT.bat (cửa sổ tiến trình), báo rõ nếu lỗi; rồi mở cổng LAN nếu được chọn.
procedure CurStepChanged(CurStep: TSetupStep);
var Rc: Integer;
begin
  if CurStep <> ssPostInstall then exit;
  WizardForm.StatusLabel.Caption := CustomMessage('DangCai');
  if not Exec(ExpandConstant('{cmd}'), '/c "set AISRM_KHONG_DUNG=1&& "' + ExpandConstant('{app}\CAI_DAT.bat') + '" -KhongTaoLoiTat -KhongMoTrinhDuyet"',
      ExpandConstant('{app}'), SW_SHOW, ewWaitUntilTerminated, Rc) or (Rc <> 0) then begin
    SuppressibleMsgBox(CustomMessage('CaiLoi') + #13#10#13#10 + ExpandConstant('{app}\he-thong\cai-dat.log'), mbError, MB_OK, IDOK);
    exit;
  end;
  if WizardIsTaskSelected('lan') then begin
    WizardForm.StatusLabel.Caption := CustomMessage('DangMoLan');
    if ShellExec('runas', 'powershell.exe',
        '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\he-thong\mo-mang-lan.ps1') + '"',
        ExpandConstant('{app}\he-thong'), SW_HIDE, ewWaitUntilTerminated, Rc) and (Rc = 0) then
      SaveStringToFile(ExpandConstant('{app}\he-thong\lan.on'), '1', False)
    else
      SuppressibleMsgBox(CustomMessage('LanLoi'), mbInformation, MB_OK, IDOK);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Rc: Integer;
begin
  // Xóa quy tắc tường lửa đã mở lúc cài (cần quyền quản trị) — trước khi go-cai-dat xóa .env.
  if (CurUninstallStep = usUninstall) and FileExists(ExpandConstant('{app}\he-thong\lan.on')) then
    ShellExec('runas', 'powershell.exe',
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\he-thong\mo-mang-lan.ps1') + '" -Dong',
      ExpandConstant('{app}\he-thong'), SW_HIDE, ewWaitUntilTerminated, Rc);
end;
