using Photino.NET;
using System;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Meteorite
{
    internal class Program
    {
        public const string VERSION = "0.1.0";

        public const string VERSION_URL = "https://test.scrim.dev/app.version";

        public const int UPDATE_SNOOZE_DAYS = 3;

        public static PhotinoWindow? MainWindow { get; private set; }

        private static readonly HttpClient Http = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(8)
        };

        [STAThread]
        static void Main()
        {
            SettingsManager.Load();
            HistoryManager.Load();
            MainWindow = new PhotinoWindow()
                .SetTitle("Meteorite")
                .SetUseOsDefaultSize(false)
                .SetSize(new Size(900, 600))
                .SetMinSize(900, 600)
                .Center().SetDevToolsEnabled(false).SetContextMenuEnabled(false).SetIconFile("GUI\\logo.ico")
                .SetMediaAutoplayEnabled(true)
                .SetResizable(true)
                .RegisterWebMessageReceivedHandler((object sender, string message) =>
                {
                    PhotinoListener.Listen((PhotinoWindow)sender, message);
                })
                .Load("GUI\\App.html");

            MainWindow.WaitForClose();
        }

        public static void Send(PhotinoWindow window, string type, object data)
        {
            if (window == null) return;
            try
            {
                var payload = new { type = type, data = data };
                string json = JsonConvert.SerializeObject(payload);
                window.SendWebMessage(json);
            }
            catch (ApplicationException)
            {
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending message to UI: {ex.Message}");
            }
        }

        public static async Task<string> GetClipboardTextAsync()
        {
            try
            {
                using var process = new System.Diagnostics.Process
                {
                    StartInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "powershell.exe",
                        Arguments = "-NoProfile -Command \"Get-Clipboard\"",
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };
                process.Start();
                string output = await process.StandardOutput.ReadToEndAsync();
                await process.WaitForExitAsync();
                return output.Trim();
            }
            catch
            {
                return string.Empty;
            }
        }

        public static async Task CheckForUpdateAsync(PhotinoWindow window)
        {
            // Respect snooze window
            var snoozeUntil = SettingsManager.Current.UpdateSnoozeUntil;
            if (snoozeUntil.HasValue && DateTime.UtcNow < snoozeUntil.Value)
            {
                Send(window, "update_not_needed", null);
                return;
            }

            try
            {
                string remoteVersion = (await Http.GetStringAsync(VERSION_URL)).Trim();
                if (!string.Equals(remoteVersion, VERSION, StringComparison.OrdinalIgnoreCase))
                {
                    Logger.Log($"Update available: current={VERSION}, latest={remoteVersion}", "INFO");
                    Send(window, "update_available", new { currentVersion = VERSION, latestVersion = remoteVersion });
                }
                else
                {
                    Send(window, "update_not_needed", null);
                }
            }
            catch (Exception ex)
            {
                // Silently ignore — network may be unavailable
                Logger.Log($"Update check failed: {ex.Message}", "DEBUG");
                Send(window, "update_not_needed", null);
            }
        }
    }

    public static class PhotinoListener
    {
        public static void Listen(PhotinoWindow window, string message)
        {
            var req = JObject.Parse(message);
            string action = req["action"]?.ToString() ?? "";

            if (action == "ui_ready")
            {
                Logger.Log("Application UI started and connected.", "INFO");
                Program.Send(window, "app_version", Program.VERSION);
            }
            else if (action == "get_settings")
            {
                Logger.Log("Settings requested by UI.", "DEBUG");
                Program.Send(window, "settings_data", SettingsManager.Current);
            }
            else if (action == "save_settings")
            {
                var newSettings = req["data"]?.ToObject<AppSettings>();
                if (newSettings != null)
                {
                    SettingsManager.Current.DownloadPath = newSettings.DownloadPath;
                    SettingsManager.Current.Theme = newSettings.Theme;
                    SettingsManager.Current.AccentColor = newSettings.AccentColor;
                    SettingsManager.Current.RainbowMode = newSettings.RainbowMode;
                    SettingsManager.Current.AutoDownloader = newSettings.AutoDownloader;
                    SettingsManager.Current.SidebarCollapsed = newSettings.SidebarCollapsed;
                    SettingsManager.Current.EasterEggUnlocked = newSettings.EasterEggUnlocked;
                    SettingsManager.Current.SmoothScrolling = newSettings.SmoothScrolling;
                    SettingsManager.Save();
                    Logger.Log("Settings saved successfully.", "INFO");
                    Program.Send(window, "settings_saved", null);
                }
            }
            else if (action == "get_history")
            {
                Program.Send(window, "history_data", HistoryManager.History);
            }
            else if (action == "clear_history")
            {
                HistoryManager.ClearHistory();
                Program.Send(window, "history_data", HistoryManager.History);
            }
            else if (action == "delete_history_entry")
            {
                string id = req["data"]?.ToString();
                if (!string.IsNullOrEmpty(id))
                {
                    HistoryManager.RemoveEntry(id);
                    Program.Send(window, "history_data", HistoryManager.History);
                }
            }
            else if (action == "check_clipboard")
            {
                Task.Run(async () =>
                {
                    string clipboardText = await Program.GetClipboardTextAsync();
                    if (!string.IsNullOrEmpty(clipboardText) && MedalApi.CheckURL(clipboardText))
                    {
                        Program.Send(window, "clipboard_check", new { hasMedalUrl = true, url = clipboardText });
                    }
                    else
                    {
                        Program.Send(window, "clipboard_check", new { hasMedalUrl = false });
                    }
                });
            }
            else if (action == "open_folder")
            {
                string path = req["data"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(path))
                    System.Diagnostics.Process.Start("explorer.exe", $"/select,\"{path}\"");
            }
            else if (action == "open_url")
            {
                string url = req["data"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(url))
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo { FileName = url, UseShellExecute = true });
            }
            else if (action == "play_video")
            {
                string path = req["data"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(path))
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo { FileName = path, UseShellExecute = true });
            }
            else if (action == "download")
            {
                Task.Run(async () =>
                {
                    string url = req["data"]?.ToString() ?? "";
                    string cleanUrl = MedalApi.ConfigureURL(url);
                    if (string.IsNullOrEmpty(cleanUrl) || !MedalApi.CheckURL(cleanUrl))
                    {
                        Logger.Log($"Invalid URL submitted: {url}", "WARN");
                        Program.Send(window, "download_status", new { status = "error", message = "Invalid Medal.tv URL." });
                        return;
                    }

                    Logger.Log($"Starting download process for URL: {cleanUrl}", "INFO");
                    Program.Send(window, "download_progress", new { status = "downloading" });

                    string videoUrl = await MedalApi.GetVideoURL(cleanUrl);
                    if (string.IsNullOrEmpty(videoUrl))
                    {
                        Logger.Log("Clip not found or cannot be extracted.", "ERROR");
                        Program.Send(window, "download_status", new { status = "error", message = "Clip not found or cannot be extracted." });
                        return;
                    }

                    Logger.Log("Successfully extracted direct video URL, beginning download...", "INFO");

                    string clipId = MedalApi.ExtractClipID(cleanUrl) ?? Guid.NewGuid().ToString().Substring(0, 8);
                    string fileName = $"MedalClip_{clipId}_{DateTime.Now:yyyyMMdd_HHmmss}.mp4";
                    string destination = Path.Combine(SettingsManager.Current.DownloadPath, fileName);

                    var prog = new Progress<(long downloaded, long total)>(p =>
                    {
                        Program.Send(window, "download_progress", new { status = "downloading", downloaded = p.downloaded, total = p.total });
                    });

                    bool success = await MedalApi.DownloadVideoAsync(videoUrl, destination, prog);
                    if (success)
                    {
                        Logger.Log($"Download complete: {destination}", "INFO");
                        var entry = new HistoryEntry
                        {
                            Url = cleanUrl,
                            FilePath = destination,
                            Title = $"Medal Clip {clipId}",
                            ThumbnailUrl = ""
                        };
                        HistoryManager.AddEntry(entry);
                        Program.Send(window, "download_status", new { status = "success", entry = entry });
                        Program.Send(window, "history_data", HistoryManager.History);
                    }
                    else
                    {
                        Logger.Log("Download failed.", "ERROR");
                        Program.Send(window, "download_status", new { status = "error", message = "Failed to download the video." });
                    }
                });
            }
            else if (action == "check_tour")
            {
                string tourFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tour.json");
                bool shown = false;
                if (File.Exists(tourFile))
                {
                    try
                    {
                        var obj = Newtonsoft.Json.JsonConvert.DeserializeObject<dynamic>(File.ReadAllText(tourFile));
                        shown = (bool)(obj?.shown ?? false);
                    }
                    catch { }
                }
                Program.Send(window, "tour_state", new { shown });
            }
            else if (action == "tour_done")
            {
                string tourFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tour.json");
                try { File.WriteAllText(tourFile, Newtonsoft.Json.JsonConvert.SerializeObject(new { shown = true })); } catch { }
            }
            else if (action == "check_update")
            {
                Task.Run(async () => await Program.CheckForUpdateAsync(window));
            }
            else if (action == "snooze_update")
            {
                SettingsManager.Current.UpdateSnoozeUntil = DateTime.UtcNow.AddDays(Program.UPDATE_SNOOZE_DAYS);
                SettingsManager.Save();
                Logger.Log($"Update snoozed for {Program.UPDATE_SNOOZE_DAYS} days.", "INFO");
            }
        }
    }

    public static class Logger
    {
        private static readonly string LogFile = "app.log";

        public static void Log(string message, string level = "INFO")
        {
            string formatted = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [{level}] {message}";
            try
            {
                File.AppendAllText(LogFile, formatted + Environment.NewLine);
            }
            catch { }

            if (Program.MainWindow != null)
            {
                Program.Send(Program.MainWindow, "app_log", new { level, message, time = DateTime.Now.ToString("HH:mm:ss") });
            }
        }
    }
}