using System;
using System.IO;
using Newtonsoft.Json;

namespace Meteorite
{
    public class AppSettings
    {
        public string DownloadPath { get; set; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyVideos), "Meteorite");
        public string Theme { get; set; } = "dark";
        public string AccentColor { get; set; } = "#BEF837";
        public bool RainbowMode { get; set; } = false;
        public bool AutoDownloader { get; set; } = false;
        public bool SidebarCollapsed { get; set; } = false;
        public bool EasterEggUnlocked { get; set; } = false;
    }

    public static class SettingsManager
    {
        private static readonly string SettingsFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "settings.json");
        public static AppSettings Current { get; private set; } = new AppSettings();

        public static void Load()
        {
            if (File.Exists(SettingsFilePath))
            {
                try
                {
                    string json = File.ReadAllText(SettingsFilePath);
                    var settings = JsonConvert.DeserializeObject<AppSettings>(json);
                    if (settings != null) Current = settings;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error loading settings: {ex.Message}");
                }
            }
            else
            {
                Save();
            }
        }

        public static void Save()
        {
            try
            {
                string json = JsonConvert.SerializeObject(Current, Formatting.Indented);
                File.WriteAllText(SettingsFilePath, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving settings: {ex.Message}");
            }
        }
    }
}
