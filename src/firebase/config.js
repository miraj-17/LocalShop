import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC8hMnpEW1jqkDSRuFH2FMo957wB9E9IKg",
  authDomain: "localshop-5e90d.firebaseapp.com",
  projectId: "localshop-5e90d",
  storageBucket: "localshop-5e90d.firebasestorage.app",
  messagingSenderId: "97293412157",
  appId: "1:97293412157:web:768ff722108b25b66ac754"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);