// The restaurant's Firebase project, built into the APK. While this is null
// every device asks for the project's config in setup (pasted from the
// Firebase console); once it is filled in, setup offers it as the default and
// a device that chose it follows whatever the installed APK carries.
//
// To build it in: Firebase console → Project settings → Your apps → the web
// app → "SDK setup and configuration" → Config, and paste the object here:
//
//   export default {
//     apiKey: 'AIza…',
//     authDomain: '<project>.firebaseapp.com',
//     projectId: '<project>',
//     storageBucket: '<project>.firebasestorage.app',
//     messagingSenderId: '…',
//     appId: '1:…:web:…',
//   };
//
// These values identify the project; they are not secrets (access is guarded
// by the Firestore / Storage security rules and Firebase Auth).

export default {
  apiKey: 'AIzaSyACc7ANpHwrBKYcty2UZKJbFRkzCARduWo',
  authDomain: 'mineo-21737.firebaseapp.com',
  projectId: 'mineo-21737',
  storageBucket: 'mineo-21737.firebasestorage.app',
  messagingSenderId: '1072021680489',
  appId: '1:1072021680489:web:699fa4c458588596d58df8',
};
