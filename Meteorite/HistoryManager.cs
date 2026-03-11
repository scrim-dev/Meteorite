using System;
using System.IO;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace Meteorite
{
    public class HistoryEntry
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Url { get; set; } = "";
        public string FilePath { get; set; } = "";
        public string ThumbnailUrl { get; set; } = "";
        public string Title { get; set; } = "";
        public DateTime DownloadDate { get; set; } = DateTime.Now;
    }

    public static class HistoryManager
    {
        private static readonly string HistoryFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "history.json");
        public static List<HistoryEntry> History { get; private set; } = new List<HistoryEntry>();

        public static void Load()
        {
            if (File.Exists(HistoryFilePath))
            {
                try
                {
                    string json = File.ReadAllText(HistoryFilePath);
                    var history = JsonConvert.DeserializeObject<List<HistoryEntry>>(json);
                    if (history != null) History = history;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error loading history: {ex.Message}");
                }
            }
        }

        public static void Save()
        {
            try
            {
                string json = JsonConvert.SerializeObject(History, Formatting.Indented);
                File.WriteAllText(HistoryFilePath, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving history: {ex.Message}");
            }
        }

        public static void AddEntry(HistoryEntry entry)
        {
            History.Insert(0, entry); // Add to the top
            Save();
        }

        public static void RemoveEntry(string id)
        {
            History.RemoveAll(x => x.Id == id);
            Save();
        }
        
        public static void ClearHistory()
        {
            History.Clear();
            Save();
        }
    }
}
