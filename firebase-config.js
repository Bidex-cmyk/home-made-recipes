// Firebase Web config injected for hosts other than Firebase Hosting (e.g. Vercel).
//
// These values are PUBLIC — they already ship to every browser via Firebase Hosting's
// /__/firebase/init.json. They are not secrets (see DEPLOYMENT.md §8).
//
// How this interacts with Firebase Hosting:
//   - On *.web.app / *.firebaseapp.com, index.html's fetchHostingConfig() overrides this
//     with the per-environment config, so staging stays on staging and production on
//     production. This file just seeds a default.
//   - Skipped on localhost / file:// so local development keeps using demoMode
//     (localStorage seed data) and never silently talks to production.
(function () {
  var host = location.hostname;
  var isLocal =
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    location.protocol === 'file:';
  if (isLocal) return;

  window.__FIREBASE_CONFIG__ = {
    apiKey: 'AIzaSyCyCX2lqwIDzgRtAatpjozvHH9k0KTovDw',
    authDomain: 'home-made-recipe-c857f.firebaseapp.com',
    projectId: 'home-made-recipe-c857f',
    storageBucket: 'home-made-recipe-c857f.firebasestorage.app',
    messagingSenderId: '706429217715',
    appId: '1:706429217715:web:d0f73dbd1a49f0feb679c6',
    measurementId: 'G-PZKDLJCV62'
  };
})();
