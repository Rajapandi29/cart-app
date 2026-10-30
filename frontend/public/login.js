
const loginButton = document.getElementById("microsoftLogin");

loginButton.addEventListener("click", () => {

  loginButton.disabled = true;

  loginButton.textContent = "Redirecting to Microsoft...";

  // Azure App Service Easy Auth login
  window.location.assign("/login");

});
