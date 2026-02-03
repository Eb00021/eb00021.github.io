const firebaseConfig = {
    apiKey: "YAIzaSyD-3Xk0P0nMlsPsbJeGRfXF6lD9ILbBfsE",
    authDomain: "t4bf-docs.firebaseapp.com",
    databaseURL: "https://t4bf-docs-default-rtdb.firebaseio.com",
    projectId: "t4bf-docs",
    storageBucket: "t4bf-docs.appspot.com",
    messagingSenderId: "4150954535",
    appId: "1:4150954535:web:0e856d5b5b3f69ec035c02"
};

// Admin email - change this to your email address
const ADMIN_EMAIL = "ehboyd131@gmail.com";

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { firebaseConfig, ADMIN_EMAIL };
}
