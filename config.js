// Where the website finds its backend (portfolio-api). Change API_BASE after deploying the API.
(() => {
  const API_BASE = "https://api.ahmedeldegla.com";
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  window.AE_API = local ? "http://localhost:5073" : API_BASE;
})();
