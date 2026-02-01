using System;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace GeoCraft.Desktop
{
    public partial class MainWindow : Window
    {
        private GeoCraftBridge? _bridge;

        public MainWindow()
        {
            InitializeComponent();
            InitializeAsync();
        }

        async void InitializeAsync()
        {
            try
            {
                // Ensure the CoreWebView2Environment is initialized
                await webView.EnsureCoreWebView2Async(null);

                _bridge = new GeoCraftBridge(this);
                webView.CoreWebView2.AddHostObjectToScript("geoCraft", _bridge);

                string userDataFolder = System.IO.Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData), "GeoCraft");
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string distDir = System.IO.Path.Combine(appDir, "wwwroot");
                string indexFile = System.IO.Path.Combine(distDir, "index.html");

                if (System.IO.File.Exists(indexFile))
                {
                    // Production: Load from local file
                    // Use SetVirtualHostNameToFolderMapping for better CORS/Asset handling?
                    // Or just file URI for now.
                    webView.CoreWebView2.SetVirtualHostNameToFolderMapping("geocraft.local", distDir, CoreWebView2HostResourceAccessKind.Allow);
                    webView.CoreWebView2.Navigate("http://geocraft.local/index.html");
                }
                else
                {
                    // Development: Load from Vite Dev Server
                    webView.CoreWebView2.Navigate("http://localhost:5173");
                }
                
                // Allow CORS/Mixed content if needed (optional)
                webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
                
                // Open DevTools for debugging
                webView.CoreWebView2.OpenDevToolsWindow(); // Optional: Disable in prod?
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to initialize WebView2: " + ex.Message);
            }
        }
    }
}