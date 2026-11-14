document.addEventListener('DOMContentLoaded', function() {
	for(var cookieName in wpml_cookies) {
		var cookieData = wpml_cookies[cookieName];
		// A page cached before maxAge existed only carries expires (wpmldev-10219).
		var lifetime = cookieData.maxAge ? 'max-age=' + cookieData.maxAge : 'expires=' + cookieData.expires;
		document.cookie = cookieName + '=' + cookieData.value + '; ' + lifetime + '; path=' + cookieData.path + '; SameSite=Lax';
	}
});
