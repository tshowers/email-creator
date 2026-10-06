export const environment = {
  production: true,
  PLATFORM_URL: 'https://emails.taliferro.tech',
  backendURL: 'https://api.taliferro.tech/api',
  // Firebase web config is public by design; access is enforced by Auth + the backend.
  firebaseConfig: {
    apiKey: 'AIzaSyApZSnHn8Pd2fI_0oSod0Sv9O_JsOoniBc',
    authDomain: 'taliferrotech.firebaseapp.com',
    projectId: 'taliferrotech',
    storageBucket: 'taliferrotech.appspot.com',
    messagingSenderId: '633736143723',
    appId: '1:633736143723:web:1f91a0cc7efcdc9b5fe22e',
    measurementId: 'G-YQ9PHPM6FJ',
  },
};
