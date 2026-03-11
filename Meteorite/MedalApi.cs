using System;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Meteorite
{
    public static class MedalApi
    {
        private static readonly HttpClient client = new HttpClient();

        public static string ConfigureURL(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return null;
            if (!url.ToLower().Contains("medal"))
            {
                if (!url.Contains("/")) url = "https://medal.tv/?contentId=" + url.Trim();
                else return null;
            }
            if (url.ToLower().IndexOf("https://") != url.ToLower().LastIndexOf("https://"))
            {
                return null;
            }
            if (!url.ToLower().Contains("https://"))
            {
                url = "https://" + url;
            }
            url = url.Replace("?theater=true", "");
            return url.Trim();
        }

        public static string ExtractClipID(string url)
        {
            var clipIdMatch = Regex.Match(url, @"/clips/([^/?&]+)");
            var contentIdMatch = Regex.Match(url, @"[?&]contentId=([^&]+)");

            if (clipIdMatch.Success) return clipIdMatch.Groups[1].Value;
            if (contentIdMatch.Success) return contentIdMatch.Groups[1].Value;
            return null;
        }

        public static bool CheckURL(string url)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(url)) return false;
                var uri = new Uri(url);
                return uri.Host.ToLower().Contains("medal");
            }
            catch
            {
                return false;
            }
        }

        public static async Task<string> GetVideoURL(string url)
        {
            try
            {
                string clipId = ExtractClipID(url);
                string fetchURL = !string.IsNullOrEmpty(clipId) ? $"https://medal.tv/clips/{clipId}" : url;

                var res = await client.GetAsync(fetchURL);
                if (!res.IsSuccessStatusCode) return null;

                string html = await res.Content.ReadAsStringAsync();

                var contentUrlSplit = html.Split(new[] { "\"contentUrl\":\"" }, StringSplitOptions.None);
                if (contentUrlSplit.Length > 1)
                {
                    var videoContentUrl = contentUrlSplit[1].Split(new[] { "\",\"" }, StringSplitOptions.None)[0];
                    if (!string.IsNullOrEmpty(videoContentUrl) && videoContentUrl.StartsWith("http"))
                        return videoContentUrl;
                }

                var metaUrlSplit = html.Split(new[] { "property=\"og:video:url\" content=\"" }, StringSplitOptions.None);
                if (metaUrlSplit.Length > 1)
                {
                    var videoMetaUrl = metaUrlSplit[1].Split('"')[0];
                    if (!string.IsNullOrEmpty(videoMetaUrl) && videoMetaUrl.StartsWith("http"))
                        return videoMetaUrl;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fetching video URL: {ex.Message}");
                return null;
            }
            return null;
        }

        public static async Task<bool> DownloadVideoAsync(string videoUrl, string destinationPath, IProgress<(long, long)> progress = null)
        {
            try
            {
                var response = await client.GetAsync(videoUrl, HttpCompletionOption.ResponseHeadersRead);
                response.EnsureSuccessStatusCode();

                long? totalBytes = response.Content.Headers.ContentLength;

                using var stream = await response.Content.ReadAsStreamAsync();
                var directory = Path.GetDirectoryName(destinationPath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }
                
                using var fs = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);
                
                byte[] buffer = new byte[8192];
                int bytesRead;
                long totalRead = 0;

                while ((bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length)) > 0)
                {
                    await fs.WriteAsync(buffer, 0, bytesRead);
                    totalRead += bytesRead;
                    if (totalBytes.HasValue)
                    {
                        progress?.Report((totalRead, totalBytes.Value));
                    }
                }
                
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error downloading video: {ex.Message}");
                return false;
            }
        }
    }
}
