import { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase/config";

import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

/* =====================================================
   CONSTANTS
===================================================== */

const SUPPORT = {
  whatsapp: "8801602310443",
  phone: "+8801602310443",
  email: "allmamunabdullah333@gmail.com",
};

const PERMISSIONS = [
  ["manage_merchants", "Manage Merchants"],
  ["manage_customers", "Manage Customers"],
  ["manage_orders", "Manage Orders"],
  ["manage_products", "Manage Products"],
  ["view_sales", "View Sales"],
  ["manage_support", "Manage Support"],
  ["manage_admins", "Manage Administrators"],
];

const NAV = [
  ["overview", "Overview", "Overview"],
  ["admins", "Administrators", "manage_admins"],
  ["merchants", "Merchants", "manage_merchants"],
  ["customers", "Customers", "manage_customers"],
  ["shops", "Shops", "manage_merchants"],
  ["products", "Products", "manage_products"],
  ["orders", "Orders", "manage_orders"],
  ["sales", "Sales", "view_sales"],
  ["support", "Support", "manage_support"],
];

const ORDER_STATUSES = [
  ["pending", "Order Placed"],
  ["confirmed", "Confirmed"],
  ["packed", "Packed"],
  ["shipped", "Shipped"],
  ["out_for_delivery", "Out for Delivery"],
  ["delivered", "Delivered"],
];

const CART_STORAGE_KEY = "localshop_guest_cart_v1";

const ORDER_API_URL = (
  import.meta.env.VITE_ORDER_API_URL || ""
).trim();

const ADMIN_API_URL = (
  import.meta.env.VITE_ADMIN_API_URL || ""
).trim();

/* =====================================================
   UTILITIES
===================================================== */

function formatMoney(value) {
  return `৳${Number(value || 0).toLocaleString("en-BD")}`;
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = dateValue(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value) {
  const d = dateValue(value);
  if (!d) return "—";
  return d.toLocaleString("en-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleLabel(role) {
  return (
    {
      owner: "Owner",
      admin: "Administrator",
      merchant: "Merchant",
      customer: "Customer",
    }[role] || "User"
  );
}

function statusClass(status) {
  if (status === "active" || status === "verified" || status === "delivered" || status === "accepted")
    return "success";
  if (status === "pending" || status === "suspended" || status === "confirmed" || status === "packed" || status === "shipped" || status === "out_for_delivery")
    return "warning";
  if (status === "banned" || status === "rejected" || status === "cancelled") return "danger";
  return "neutral";
}

function hasPermission(profile, permission) {
  if (!profile) return false;

  if (profile.role === "owner") {
    return true;
  }

  if (profile.role !== "admin") {
    return false;
  }

  return (
    Array.isArray(profile.permissions) &&
    profile.permissions.includes(permission)
  );
}

function emailToInviteId(email) {
  return (email || "").trim().toLowerCase();
}

function authError(err) {
  const messages = {
    "auth/invalid-credential": "Invalid email or password.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/missing-email": "Please enter your email address first.",
    "auth/network-request-failed": "Network error. Please check your internet connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
  };
  return messages[err?.code] || err?.message || "Something went wrong.";
}

/* =====================================================
   APP ROOT
===================================================== */

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [authLoading, setAuthLoading] = useState(true);

  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [registerRole, setRegisterRole] = useState("customer");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [section, setSection] = useState("overview");
  const [merchantSection, setMerchantSection] = useState("dashboard");
  const [customerSection, setCustomerSection] = useState("marketplace");

  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [invites, setInvites] = useState([]);

  const [showShopForm, setShowShopForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [shopName, setShopName] = useState("");
  const [shopDescription, setShopDescription] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopAddress, setShopAddress] = useState("");

  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productQuantity, setProductQuantity] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productImage, setProductImage] = useState("");

  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [selectedAdminPermissions, setSelectedAdminPermissions] = useState([]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermissions, setInvitePermissions] = useState([]);

  const [trackingOrder, setTrackingOrder] = useState(null);
  const [statusUpdateOrder, setStatusUpdateOrder] = useState(null);
  const [statusUpdateStatus, setStatusUpdateStatus] = useState("pending");
  const [statusUpdateCourier, setStatusUpdateCourier] = useState("");
  const [statusUpdateTracking, setStatusUpdateTracking] = useState("");
  const [statusUpdateNote, setStatusUpdateNote] = useState("");

  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [checkoutPhone, setCheckoutPhone] = useState("");
  const [checkoutAddress, setCheckoutAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash on Delivery");

  /* ── Persist guest cart ── */
  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* ignore storage errors */
    }
  }, [cart]);

  /* ── Apply a pending owner invite to a newly logged-in / registered user ── */
  async function checkAndApplyInvite(uid, userEmail, currentRole) {
    if (!userEmail) return null;

    if (currentRole === "owner" || currentRole === "admin") {
      return null;
    }

    if (!ADMIN_API_URL) {
      return null;
    }

    try {
      const token = await auth.currentUser?.getIdToken();

      if (!token) {
        return null;
      }

      const response = await fetch(
        `${ADMIN_API_URL}/invites/accept`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            uid,
            email: userEmail,
          }),
        }
      );

      if (!response.ok) {
        return null;
      }

      const snap = await getDoc(doc(db, "users", uid));

      if (!snap.exists()) {
        return null;
      }

      return {
        id: snap.id,
        ...snap.data(),
      };
    } catch {
      return null;
    }
  }

  /* ── Auth listener ── */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);

      if (!user) {
        setProfile(null);
        setAuthLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const profileData = { id: snap.id, ...snap.data() };
          const upgraded = await checkAndApplyInvite(
            user.uid,
            user.email,
            profileData.role
          );
          setProfile(upgraded || profileData);
        } else {
          setProfile(null);
          setError(
            "Your account profile is missing. Please contact LocalShop support."
          );
        }
      } catch (err) {
        setError(err.message);
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /* ── Public data: shops & products, always live, no login required ── */
  useEffect(() => {
    const unsubShops = onSnapshot(collection(db, "shops"), (snap) => {
      setShops(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubShops();
      unsubProducts();
    };
  }, []);

  /* ── Role-scoped live data: users, orders, invites ── */
  useEffect(() => {
    if (!authUser || !profile) {
      setUsers([]);
      setOrders([]);
      setInvites([]);
      return;
    }

    const unsubs = [];

    if (profile.role === "owner") {
      unsubs.push(
        onSnapshot(collection(db, "users"), (snap) =>
          setUsers(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }))
          )
        )
      );

      unsubs.push(
        onSnapshot(collection(db, "orders"), (snap) =>
          setOrders(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }))
          )
        )
      );

      unsubs.push(
        onSnapshot(collection(db, "invites"), (snap) =>
          setInvites(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }))
          )
        )
      );
    }

    if (profile.role === "admin") {
      const userBuckets = new Map();

      const mergeUsers = (snap) => {
        snap.docs.forEach((d) => {
          userBuckets.set(d.id, {
            id: d.id,
            ...d.data(),
          });
        });

        setUsers([...userBuckets.values()]);
      };

      if (hasPermission(profile, "manage_merchants")) {
        const q = query(
          collection(db, "users"),
          where("role", "==", "merchant")
        );
        unsubs.push(onSnapshot(q, mergeUsers));
      }

      if (hasPermission(profile, "manage_customers")) {
        const q = query(
          collection(db, "users"),
          where("role", "==", "customer")
        );
        unsubs.push(onSnapshot(q, mergeUsers));
      }

      if (hasPermission(profile, "manage_admins")) {
        const q = query(
          collection(db, "users"),
          where("role", "==", "admin")
        );
        unsubs.push(onSnapshot(q, mergeUsers));
      }

      if (hasPermission(profile, "manage_orders") || hasPermission(profile, "view_sales")) {
        unsubs.push(
          onSnapshot(collection(db, "orders"), (snap) =>
            setOrders(
              snap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }))
            )
          )
        );
      }
    }

    if (profile.role === "merchant") {
      const q = query(
        collection(db, "orders"),
        where("merchantId", "==", authUser.uid)
      );

      unsubs.push(
        onSnapshot(q, (snap) =>
          setOrders(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }))
          )
        )
      );
    }

    if (profile.role === "customer") {
      const q = query(
        collection(db, "orders"),
        where("customerId", "==", authUser.uid)
      );

      unsubs.push(
        onSnapshot(q, (snap) =>
          setOrders(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }))
          )
        )
      );
    }

    return () => unsubs.forEach((fn) => fn());
  }, [authUser, profile]);

  /* ── Derived: own shop / own products from live public data ── */
  const shop = useMemo(() => {
    if (!authUser) return null;
    return (
      shops.find((s) => s.ownerId === authUser.uid) ||
      shops.find((s) => s.id === authUser.uid) ||
      null
    );
  }, [shops, authUser]);

  const myProducts = useMemo(() => {
    if (!authUser) return [];
    return products.filter(
      (p) => p.ownerId === authUser.uid || p.shopId === authUser.uid
    );
  }, [products, authUser]);

  /* ── Auth form ── */
  async function handleAuth(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      if (isRegister) {
        if (!name.trim()) {
          setError("Please enter your name.");
          return;
        }

        const { user: newUser } = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        const initialRole = registerRole === "merchant" ? "merchant" : "customer";

        await setDoc(doc(db, "users", newUser.uid), {
          name: name.trim(),
          email: newUser.email,
          phone: phone.trim(),
          address: address.trim(),
          role: initialRole,
          status: initialRole === "merchant" ? "pending" : "active",
          permissions: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const snap = await getDoc(doc(db, "users", newUser.uid));
        const profileData = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        const upgraded = await checkAndApplyInvite(newUser.uid, newUser.email, initialRole);
        setProfile(upgraded || profileData);

        setMessage("Account created successfully.");
        setName(""); setPhone(""); setAddress("");
        setShowAuthScreen(false);
        if (cart.length) setCheckoutOpen(true);
      } else {
        const { user } = await signInWithEmailAndPassword(
          auth, email.trim(), password
        );
        const snap = await getDoc(doc(db, "users", user.uid));

        if (!snap.exists()) {
          setError(
            "Your Firebase account exists but your LocalShop profile is missing. Please contact support."
          );
          return;
        }

        const profileData = { id: snap.id, ...snap.data() };
        const upgraded = await checkAndApplyInvite(user.uid, user.email, profileData.role);
        setProfile(upgraded || profileData);
        setMessage("Login successful.");
        setShowAuthScreen(false);
        if (cart.length) setCheckoutOpen(true);
      }
    } catch (err) {
      setError(authError(err));
    }
  }

  async function resetPassword() {
    setMessage("");
    setError("");

    if (isRegister) {
      setError("Switch to Login to reset your password.");
      return;
    }

    const resetEmail = email.trim();
    if (!resetEmail) {
      setError("Please enter your email address first.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setMessage("Password reset email sent. Please check your inbox and follow the link.");
    } catch (err) {
      setError(authError(err));
    }
  }

  async function logout() {
    await signOut(auth);
    setAuthUser(null);
    setProfile(null);
    setUsers([]); setOrders([]); setInvites([]);
    setSection("overview");
    setMerchantSection("dashboard");
    setCustomerSection("marketplace");
    setShowAuthScreen(false);
  }

  /* ── Shop management ── */
  async function saveShop(event) {
    event.preventDefault();
    if (!authUser) return;
    setError("");

    try {
      const shopData = {
        shopName: shopName.trim(),
        shopDescription: shopDescription.trim(),
        shopPhone: shopPhone.trim(),
        shopAddress: shopAddress.trim(),
        ownerId: authUser.uid,
        ownerEmail: authUser.email,
        status: shop?.status || "pending",
        verificationStatus: shop?.verificationStatus || "pending",
        updatedAt: serverTimestamp(),
      };

      if (!shop) shopData.createdAt = serverTimestamp();

      await setDoc(doc(db, "shops", authUser.uid), shopData, { merge: true });
      setMessage("Shop saved successfully.");
      setShowShopForm(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function openShopForm() {
    setShopName(shop?.shopName || "");
    setShopDescription(shop?.shopDescription || shop?.description || "");
    setShopPhone(shop?.shopPhone || shop?.phone || "");
    setShopAddress(shop?.shopAddress || shop?.address || "");
    setShowShopForm(true);
  }

  /* ── Product management ── */
  function openAddProduct() {
    setEditingProduct(null);
    setProductName(""); setProductPrice(""); setProductQuantity("");
    setProductDescription(""); setProductImage("");
    setShowProductForm(true);
  }

  function openEditProduct(product) {
    setEditingProduct(product);
    setProductName(product.productName || "");
    setProductPrice(String(product.price || ""));
    setProductQuantity(String(product.quantity || ""));
    setProductDescription(product.description || "");
    setProductImage(product.imageUrl || "");
    setShowProductForm(true);
  }

  async function saveProduct(event) {
    event.preventDefault();

    if (!authUser || profile?.role !== "merchant") {
      setError("Only merchant accounts can manage products.");
      return;
    }

    if (profile.status !== "active") {
      setError("Your merchant account is not active yet.");
      return;
    }

    if (
      !shop ||
      shop.status !== "active" ||
      shop.verificationStatus !== "verified"
    ) {
      setError(
        "Your shop must be active and verified before managing products."
      );
      return;
    }

    const price = Number(productPrice);
    const quantity = Number(productQuantity || 0);

    if (!productName.trim()) {
      setError("Please enter a product name.");
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setError("Please enter a valid product price.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      setError(
        "Quantity must be a whole number and cannot be negative."
      );
      return;
    }

    try {
      const data = {
        productName: productName.trim(),
        price,
        quantity,
        description: productDescription.trim(),
        imageUrl: productImage.trim(),
        ownerId: authUser.uid,
        shopId: shop.id || authUser.uid,
        status: "active",
        updatedAt: serverTimestamp(),
      };

      if (editingProduct) {
        if (editingProduct.ownerId !== authUser.uid) {
          setError("You can only edit your own products.");
          return;
        }

        await updateDoc(
          doc(db, "products", editingProduct.id),
          data
        );

        setMessage("Product updated successfully.");
      } else {
        data.createdAt = serverTimestamp();

        await addDoc(
          collection(db, "products"),
          data
        );

        setMessage("Product added successfully.");
      }

      setShowProductForm(false);
      setEditingProduct(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteProduct(productId) {
    if (profile?.role !== "merchant") {
      setError("Only merchants can delete products.");
      return;
    }

    const target = myProducts.find(
      (product) => product.id === productId
    );

    if (!target || target.ownerId !== authUser.uid) {
      setError("You can only delete your own products.");
      return;
    }

    if (
      !window.confirm(
        "Are you sure you want to delete this product?"
      )
    ) {
      return;
    }

    try {
      await deleteDoc(
        doc(db, "products", productId)
      );

      setMessage("Product deleted.");
    } catch (err) {
      setError(err.message);
    }
  }

  /* ── Admin management ── */
  async function updateUserStatus(userId, status) {
    if (profile?.role !== "owner") {
      setError("Only the Owner can change account status.");
      return;
    }

    const target = users.find((u) => u.id === userId);
    if (!target || target.role === "owner") {
      setError("The Owner account cannot be modified.");
      return;
    }

    try {
      await updateDoc(doc(db, "users", userId), {
        status,
        updatedAt: serverTimestamp(),
      });

      const targetShop = shops.find(
        (s) => s.ownerId === userId || s.id === userId
      );

      if (targetShop) {
        await updateDoc(doc(db, "shops", targetShop.id), {
          status,
          updatedAt: serverTimestamp(),
        });
      }

      setMessage(`Account status changed to ${status}.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function verifyShop(shopId, verificationStatus) {
    if (profile?.role !== "owner") {
      setError("Only the Owner can verify shops.");
      return;
    }

    try {
      await updateDoc(doc(db, "shops", shopId), {
        verificationStatus,
        status: verificationStatus === "verified" ? "active" : "pending",
        updatedAt: serverTimestamp(),
      });

      setMessage(
        verificationStatus === "verified"
          ? "Shop verified successfully."
          : "Shop verification rejected."
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function promoteToAdmin(user) {
    if (profile?.role !== "owner") {
      setError("Only the Owner can manage administrators.");
      return;
    }
    if (user.role === "owner") {
      setError("The Owner cannot be changed.");
      return;
    }

    try {
      await updateDoc(doc(db, "users", user.id), {
        role: "admin",
        previousRole: user.role || "customer",
        permissions: [],
        updatedAt: serverTimestamp(),
      });
      setMessage(`${user.name || user.email} is now an Administrator.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function revokeAdmin(user) {
    if (profile?.role !== "owner") {
      setError("Only the Owner can revoke administrators.");
      return;
    }
    if (user.role !== "admin") return;

    const restoredRole =
      user.previousRole === "merchant" ? "merchant" : "customer";

    try {
      await updateDoc(doc(db, "users", user.id), {
        role: restoredRole,
        permissions: [],
        updatedAt: serverTimestamp(),
      });
      setMessage("Administrator access revoked.");
    } catch (err) {
      setError(err.message);
    }
  }

  function openPermissionEditor(admin) {
    setSelectedAdmin(admin);
    setSelectedAdminPermissions(
      Array.isArray(admin.permissions) ? admin.permissions : []
    );
  }

  async function saveAdminPermissions() {
    if (!selectedAdmin || profile?.role !== "owner") {
      setError("Only the Owner can change admin permissions.");
      return;
    }

    try {
      await updateDoc(doc(db, "users", selectedAdmin.id), {
        role: "admin",
        permissions: selectedAdminPermissions,
        updatedAt: serverTimestamp(),
      });
      setSelectedAdmin(null);
      setSelectedAdminPermissions([]);
      setMessage("Administrator permissions updated.");
    } catch (err) {
      setError(err.message);
    }
  }

  /* ── Owner: secure admin invites through backend ── */
  async function sendAdminInvite(event) {
    event.preventDefault();

    if (profile?.role !== "owner") {
      setError(
        "Only the Owner can send administrator invites."
      );
      return;
    }

    if (!ADMIN_API_URL) {
      setError(
        "Admin backend is not configured yet. Set VITE_ADMIN_API_URL."
      );
      return;
    }

    const emailId = emailToInviteId(inviteEmail);

    if (!emailId) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      const token =
        await auth.currentUser?.getIdToken();

      if (!token) {
        setError(
          "Your login session expired. Please sign in again."
        );
        return;
      }

      const response = await fetch(
        `${ADMIN_API_URL}/invites`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: emailId,
            permissions: Array.isArray(
              invitePermissions
            )
              ? invitePermissions
              : [],
          }),
        }
      );

      const payload =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "Failed to create administrator invite."
        );
      }

      setMessage(
        `${emailId} has been invited as an Administrator.`
      );

      setInviteEmail("");
      setInvitePermissions([]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelInvite(emailId) {
    if (profile?.role !== "owner") {
      return;
    }

    if (!ADMIN_API_URL) {
      setError(
        "Admin backend is not configured yet. Set VITE_ADMIN_API_URL."
      );
      return;
    }

    try {
      const token =
        await auth.currentUser?.getIdToken();

      if (!token) {
        throw new Error(
          "Your login session expired. Please sign in again."
        );
      }

      const response = await fetch(
        `${ADMIN_API_URL}/invites/${encodeURIComponent(
          emailId
        )}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const payload =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "Failed to cancel invite."
        );
      }

      setMessage("Invite cancelled.");
    } catch (err) {
      setError(err.message);
    }
  }

  /* ── Merchant: live order-status / tracking updates ── */
  function openStatusUpdate(order) {
    setStatusUpdateOrder(order);
    setStatusUpdateStatus(order.orderStatus || "pending");
    setStatusUpdateCourier(order.courierName || "");
    setStatusUpdateTracking(order.trackingCode || "");
    setStatusUpdateNote("");
  }

  async function updateOrderTracking(event) {
    event.preventDefault();
    if (!statusUpdateOrder) return;

    const canManageOrder =
      profile?.role === "owner" ||
      hasPermission(profile, "manage_orders") ||
      (
        profile?.role === "merchant" &&
        profile.status === "active" &&
        statusUpdateOrder.merchantId === authUser?.uid
      );

    if (!canManageOrder) {
      setError(
        "You are not allowed to update this order."
      );
      return;
    }

    try {
      const entry = {
        status: statusUpdateStatus,
        note: statusUpdateNote.trim(),
        courierName: statusUpdateCourier.trim(),
        trackingCode: statusUpdateTracking.trim(),
        updatedAt: new Date(),
      };

      await updateDoc(doc(db, "orders", statusUpdateOrder.id), {
        orderStatus: statusUpdateStatus,
        courierName: statusUpdateCourier.trim(),
        trackingCode: statusUpdateTracking.trim(),
        statusHistory: arrayUnion(entry),
        updatedAt: serverTimestamp(),
      });

      setMessage("Order status ও tracking তথ্য আপডেট হয়েছে।");
      setStatusUpdateOrder(null);
    } catch (err) {
      setError(err.message);
    }
  }

  /* ── Cart & Orders ── */
  function addToCart(product) {
    if (Number(product.quantity || 0) <= 0) {
      setError("This product is out of stock.");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);

      if (existing && existing.quantity >= Number(product.quantity || 0)) {
        return prev;
      }
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.productName,
          price: Number(product.price || 0),
          quantity: 1,
          shopId: product.shopId,
          ownerId: product.ownerId,
        },
      ];
    });

    setMessage("Added to cart.");
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }

  function updateCartQuantity(productId, delta) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) {
            return item;
          }

          const liveProduct = products.find(
            (product) => product.id === productId
          );

          const liveStock = Number(
            liveProduct?.quantity ?? item.quantity
          );

          const nextQuantity =
            item.quantity + delta;

          return {
            ...item,
            quantity: Math.min(
              Math.max(nextQuantity, 0),
              Math.max(liveStock, 0)
            ),
          };
        })
        .filter((item) => item.quantity > 0)
    );
  }

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      ),
    [cart]
  );

  async function placeOrder(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!authUser || profile?.role !== "customer") {
      setError("Please login as a customer to place an order.");
      return;
    }

    if (!cart.length) {
      setError("Your cart is empty.");
      return;
    }

    if (!ORDER_API_URL) {
      setError(
        "Secure order service is not configured yet. Set VITE_ORDER_API_URL."
      );
      return;
    }

    if (!checkoutPhone.trim()) {
      setError("Please enter your phone number.");
      return;
    }

    if (!checkoutAddress.trim()) {
      setError("Please enter your delivery address.");
      return;
    }

    const firstShop = cart[0]?.shopId;

    if (!firstShop) {
      setError("Invalid cart item.");
      return;
    }

    if (cart.some((item) => item.shopId !== firstShop)) {
      setError("Please order products from one shop at a time.");
      return;
    }

    try {
      const token =
        await auth.currentUser?.getIdToken();

      if (!token) {
        setError(
          "Your login session expired. Please sign in again."
        );
        return;
      }

      const response = await fetch(
        `${ORDER_API_URL}/orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            phone: checkoutPhone.trim(),
            address: checkoutAddress.trim(),
            paymentMethod,
            items: cart.map((item) => ({
              productId: item.productId,
              quantity: Number(item.quantity || 0),
            })),
          }),
        }
      );

      const payload =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "Unable to place your order."
        );
      }

      setCart([]);
      setCheckoutOpen(false);
      setCheckoutPhone("");
      setCheckoutAddress("");

      setMessage(
        payload.message ||
          "Order placed successfully!"
      );
    } catch (err) {
      setError(err.message);
    }
  }

  /* ── Derived data ── */
  const totalGMV = orders.reduce(
    (sum, o) => sum + Number(o.orderStatus === "cancelled" ? 0 : o.total || 0),
    0
  );

  const totalItemsSold = orders.reduce(
    (sum, o) =>
      sum + (o.items || []).reduce((s, item) => s + Number(item.quantity || 0), 0),
    0
  );

  /* ── Render guards ── */
  if (authLoading) return <LoadingScreen />;

  if (authUser && !profile) {
    return (
      <div className="app">
        <div className="center-screen">
          <div className="auth-card">
            <div className="brand-mark">LS</div>
            <h1>LocalShop</h1>
            <h2>Account Setup Required</h2>
            <p className="muted">
              Your authentication account exists, but your LocalShop profile
              could not be found.
            </p>
            {error && <div className="alert danger">{error}</div>}
            <SupportLinks />
            <button className="btn secondary full" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Admin / Owner ── */
  if (authUser && profile && (profile.role === "owner" || profile.role === "admin")) {
    return (
      <AdminLayout
        profile={profile}
        section={section}
        setSection={setSection}
        logout={logout}
        error={error}
        message={message}
        users={users}
        shops={shops}
        products={products}
        orders={orders}
        invites={invites}
        totalGMV={totalGMV}
        totalItemsSold={totalItemsSold}
        promoteToAdmin={promoteToAdmin}
        revokeAdmin={revokeAdmin}
        openPermissionEditor={openPermissionEditor}
        verifyShop={verifyShop}
        updateUserStatus={updateUserStatus}
        selectedAdmin={selectedAdmin}
        setSelectedAdmin={setSelectedAdmin}
        selectedAdminPermissions={selectedAdminPermissions}
        setSelectedAdminPermissions={setSelectedAdminPermissions}
        saveAdminPermissions={saveAdminPermissions}
        hasPermission={(p) => hasPermission(profile, p)}
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        invitePermissions={invitePermissions}
        setInvitePermissions={setInvitePermissions}
        sendAdminInvite={sendAdminInvite}
        cancelInvite={cancelInvite}
        openStatusUpdate={openStatusUpdate}
        statusUpdateOrder={statusUpdateOrder}
        setStatusUpdateOrder={setStatusUpdateOrder}
        statusUpdateStatus={statusUpdateStatus}
        setStatusUpdateStatus={setStatusUpdateStatus}
        statusUpdateCourier={statusUpdateCourier}
        setStatusUpdateCourier={setStatusUpdateCourier}
        statusUpdateTracking={statusUpdateTracking}
        setStatusUpdateTracking={setStatusUpdateTracking}
        statusUpdateNote={statusUpdateNote}
        setStatusUpdateNote={setStatusUpdateNote}
        updateOrderTracking={updateOrderTracking}
      />
    );
  }

  /* ── Merchant ── */
  if (authUser && profile && profile.role === "merchant") {
    return (
      <MerchantDashboard
        profile={profile}
        shop={shop}
        products={myProducts}
        orders={orders}
        section={merchantSection}
        setSection={setMerchantSection}
        openShopForm={openShopForm}
        openAddProduct={openAddProduct}
        openEditProduct={openEditProduct}
        deleteProduct={deleteProduct}
        showShopForm={showShopForm}
        setShowShopForm={setShowShopForm}
        saveShop={saveShop}
        shopName={shopName} setShopName={setShopName}
        shopDescription={shopDescription} setShopDescription={setShopDescription}
        shopPhone={shopPhone} setShopPhone={setShopPhone}
        shopAddress={shopAddress} setShopAddress={setShopAddress}
        showProductForm={showProductForm}
        setShowProductForm={setShowProductForm}
        editingProduct={editingProduct}
        productName={productName} setProductName={setProductName}
        productPrice={productPrice} setProductPrice={setProductPrice}
        productQuantity={productQuantity} setProductQuantity={setProductQuantity}
        productDescription={productDescription} setProductDescription={setProductDescription}
        productImage={productImage} setProductImage={setProductImage}
        saveProduct={saveProduct}
        error={error}
        message={message}
        logout={logout}
        openStatusUpdate={openStatusUpdate}
        statusUpdateOrder={statusUpdateOrder}
        setStatusUpdateOrder={setStatusUpdateOrder}
        statusUpdateStatus={statusUpdateStatus}
        setStatusUpdateStatus={setStatusUpdateStatus}
        statusUpdateCourier={statusUpdateCourier}
        setStatusUpdateCourier={setStatusUpdateCourier}
        statusUpdateTracking={statusUpdateTracking}
        setStatusUpdateTracking={setStatusUpdateTracking}
        statusUpdateNote={statusUpdateNote}
        setStatusUpdateNote={setStatusUpdateNote}
        updateOrderTracking={updateOrderTracking}
      />
    );
  }

  /* ── Customer ── */
  if (authUser && profile && profile.role === "customer") {
    return (
      <CustomerDashboard
        profile={profile}
        products={products}
        shops={shops}
        orders={orders}
        section={customerSection}
        setSection={setCustomerSection}
        cart={cart}
        cartTotal={cartTotal}
        addToCart={addToCart}
        removeFromCart={removeFromCart}
        updateCartQuantity={updateCartQuantity}
        checkoutOpen={checkoutOpen}
        setCheckoutOpen={setCheckoutOpen}
        checkoutPhone={checkoutPhone} setCheckoutPhone={setCheckoutPhone}
        checkoutAddress={checkoutAddress} setCheckoutAddress={setCheckoutAddress}
        paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
        placeOrder={placeOrder}
        logout={logout}
        error={error}
        message={message}
        trackingOrder={trackingOrder}
        setTrackingOrder={setTrackingOrder}
      />
    );
  }

  /* ── Explicit login/register screen ── */
  if (showAuthScreen) {
    return (
      <AuthScreen
        isRegister={isRegister} setIsRegister={setIsRegister}
        email={email} setEmail={setEmail}
        password={password} setPassword={setPassword}
        showPassword={showPassword} setShowPassword={setShowPassword}
        name={name} setName={setName}
        phone={phone} setPhone={setPhone}
        address={address} setAddress={setAddress}
        registerRole={registerRole} setRegisterRole={setRegisterRole}
        handleAuth={handleAuth}
        resetPassword={resetPassword}
        error={error} message={message}
        onBack={() => { setShowAuthScreen(false); setError(""); setMessage(""); }}
      />
    );
  }

  /* ── Guest storefront (no login required to browse / cart) ── */
  return (
    <PublicStorefront
      products={products}
      shops={shops}
      cart={cart}
      cartTotal={cartTotal}
      addToCart={addToCart}
      removeFromCart={removeFromCart}
      updateCartQuantity={updateCartQuantity}
      checkoutOpen={checkoutOpen}
      setCheckoutOpen={setCheckoutOpen}
      onRequestLogin={() => { setShowAuthScreen(true); setError(""); setMessage(""); }}
      error={error}
      message={message}
    />
  );
}

/* =====================================================
   AUTH SCREEN
===================================================== */

function AuthScreen(props) {
  const {
    isRegister, setIsRegister, email, setEmail, password, setPassword,
    showPassword, setShowPassword, name, setName, phone, setPhone,
    address, setAddress, registerRole, setRegisterRole, handleAuth, resetPassword,
    error, message, onBack,
  } = props;

  return (
    <div className="app">
      <div className="center-screen">
        <div className="auth-card">
          <div className="brand-mark">LS</div>
          <h1>LocalShop</h1>
          <p className="muted">Bangladesh Local Commerce Platform</p>

          <div className="auth-tabs">
            <button
              className={!isRegister ? "active" : ""}
              onClick={() => setIsRegister(false)}
            >
              Login
            </button>
            <button
              className={isRegister ? "active" : ""}
              onClick={() => setIsRegister(true)}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuth}>
            {isRegister && (
              <>
                <label>Full Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />

                <label>Account Type</label>
                <select
                  value={registerRole}
                  onChange={(e) => setRegisterRole(e.target.value)}
                >
                  <option value="customer">Customer</option>
                  <option value="merchant">Merchant</option>
                </select>

                <label>Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                />

                <label>Address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Address"
                />
              </>
            )}

            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
            />

            <label>Password</label>
            <div className="password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {!isRegister && (
              <button
                type="button"
                className="auth-forgot"
                onClick={resetPassword}
              >
                Forgot password?
              </button>
            )}

            {error && <div className="alert danger">{error}</div>}
            {message && <div className="alert success">{message}</div>}

            <button className="btn primary full" type="submit">
              {isRegister ? "Create Account" : "Sign In"}
            </button>
          </form>

          <button className="btn secondary full" style={{ marginTop: 10 }} onClick={onBack}>
            ← Continue Browsing as Guest
          </button>

          <div className="auth-support">
            <span>Need help?</span>
            <a
              href={`https://wa.me/${SUPPORT.whatsapp}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================
   PUBLIC STOREFRONT (guest browsing, no login required)
===================================================== */

function PublicStorefront({
  products, shops, cart, cartTotal,
  addToCart, removeFromCart, updateCartQuantity,
  checkoutOpen, setCheckoutOpen, onRequestLogin,
  error, message,
}) {
  const activeShops = shops.filter(
    (s) =>
      s.status === "active" &&
      s.verificationStatus === "verified"
  );

  const activeProducts = products.filter(
    (p) =>
      p.status !== "hidden" &&
      Number(p.quantity || 0) > 0 &&
      activeShops.some((s) => s.id === p.shopId)
  );

  return (
    <div className="app">
      <header className="guest-topbar">
        <div className="guest-brand">
          <div className="brand-mark small">LS</div>
          <div>
            <strong>LocalShop</strong>
            <span>Bangladesh Local Commerce</span>
          </div>
        </div>
        <div className="guest-actions">
          <button className="btn secondary" onClick={onRequestLogin}>
            Login / Register
          </button>
          <button className="btn primary cart-btn" onClick={() => setCheckoutOpen(true)}>
            Cart
            {cart.length > 0 && <span className="cart-count">{cart.length}</span>}
          </button>
        </div>
      </header>

      <main className="guest-main">
        {error && <div className="alert danger">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        <section>
          <PageTitle title="Featured Shops" description="Explore verified local merchants." />
          {activeShops.length === 0 ? (
            <EmptyState text="No shops available yet." />
          ) : (
            <div className="shop-grid">
              {activeShops.map((s) => (
                <div className="shop-card" key={s.id}>
                  <strong>{s.shopName || "Local Shop"}</strong>
                  <p>{s.shopDescription || s.description || "Local merchant"}</p>
                  <Badge status={s.verificationStatus || "pending"} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="section-gap">
          <PageTitle title="Products" description="Browse freely — login only when you're ready to order." />
          {activeProducts.length === 0 ? (
            <EmptyState text="No products available right now." />
          ) : (
            <div className="market-grid">
              {activeProducts.map((product) => (
                <div className="market-product" key={product.id}>
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.productName} />
                  ) : (
                    <div className="image-placeholder">LocalShop</div>
                  )}
                  <div className="market-product-body">
                    <span className="product-eyebrow">Local Product</span>
                    <h3>{product.productName}</h3>
                    <p>{product.description || "No description"}</p>
                    <div className="product-bottom">
                      <strong>{formatMoney(product.price)}</strong>
                      <button className="btn small primary" onClick={() => addToCart(product)}>
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {checkoutOpen && (
        <Modal title="Your Cart" onClose={() => setCheckoutOpen(false)}>
          <div className="checkout-summary">
            <strong>Order Total</strong>
            <span>{formatMoney(cartTotal)}</span>
          </div>

          {cart.length === 0 ? (
            <EmptyState text="Your cart is empty." />
          ) : (
            <div className="cart-items">
              {cart.map((item) => (
                <div className="cart-row" key={item.productId}>
                  <div>
                    <strong>{item.productName}</strong>
                    <span>
                      {formatMoney(item.price)} × {item.quantity} ={" "}
                      {formatMoney(item.price * item.quantity)}
                    </span>
                  </div>
                  <div className="cart-qty">
                    <button className="btn small secondary" onClick={() => updateCartQuantity(item.productId, -1)}>−</button>
                    <span>{item.quantity}</span>
                    <button className="btn small secondary" onClick={() => updateCartQuantity(item.productId, 1)}>+</button>
                    <button className="btn small danger" onClick={() => removeFromCart(item.productId)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="guest-checkout-prompt">
              <p className="muted">
                অর্ডার সম্পন্ন করতে এবং আপনার ডেলিভারি ও লাইভ ট্র্যাকিং দেখতে লগইন বা রেজিস্ট্রেশন করুন। আপনার কার্ট সংরক্ষিত থাকবে।
              </p>
              <button
                className="btn primary full"
                onClick={() => { setCheckoutOpen(false); onRequestLogin(); }}
              >
                Login to Place Order
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* =====================================================
   ADMIN LAYOUT
===================================================== */

function AdminLayout(props) {
  const {
    profile, section, setSection, logout,
    error, message,
    users, shops, products, orders, invites,
    totalGMV, totalItemsSold,
    promoteToAdmin, revokeAdmin, openPermissionEditor,
    verifyShop, updateUserStatus,
    selectedAdmin, setSelectedAdmin,
    selectedAdminPermissions, setSelectedAdminPermissions,
    saveAdminPermissions, hasPermission,
    inviteEmail, setInviteEmail, invitePermissions, setInvitePermissions,
    sendAdminInvite, cancelInvite,
    openStatusUpdate, statusUpdateOrder, setStatusUpdateOrder,
    statusUpdateStatus, setStatusUpdateStatus,
    statusUpdateCourier, setStatusUpdateCourier,
    statusUpdateTracking, setStatusUpdateTracking,
    statusUpdateNote, setStatusUpdateNote,
    updateOrderTracking,
  } = props;

  const availableNav = NAV.filter(
    ([, , permission]) => permission === "Overview" || hasPermission(permission)
  );

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">LS</div>
          <div>
            <strong>LocalShop</strong>
            <span>Commerce Platform</span>
          </div>
        </div>

        <nav>
          {availableNav.map(([id, label]) => (
            <button
              key={id}
              className={section === id ? "nav-item active" : "nav-item"}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="role-box">
            <strong>{profile.name || profile.email}</strong>
            <span>{roleLabel(profile.role)}</span>
          </div>
          <button className="nav-item logout-nav" onClick={logout}>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{NAV.find(([id]) => id === section)?.[1] || "Dashboard"}</h1>
            <p>Manage and monitor your LocalShop platform.</p>
          </div>
          <div className="top-role">{roleLabel(profile.role)}</div>
        </header>

        {error && <div className="alert danger">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        {section === "overview" && (
          <Overview
            users={users} shops={shops} products={products} orders={orders}
            totalGMV={totalGMV} totalItemsSold={totalItemsSold}
          />
        )}
        {section === "admins" && hasPermission("manage_admins") && (
          <Administrators
            profile={profile} users={users}
            promoteToAdmin={promoteToAdmin} revokeAdmin={revokeAdmin}
            openPermissionEditor={openPermissionEditor}
            invites={invites}
            inviteEmail={inviteEmail} setInviteEmail={setInviteEmail}
            invitePermissions={invitePermissions} setInvitePermissions={setInvitePermissions}
            sendAdminInvite={sendAdminInvite} cancelInvite={cancelInvite}
          />
        )}
        {section === "merchants" && hasPermission("manage_merchants") && (
          <Merchants
            users={users} shops={shops}
            updateUserStatus={updateUserStatus} verifyShop={verifyShop}
          />
        )}
        {section === "customers" && hasPermission("manage_customers") && (
          <Customers users={users} updateUserStatus={updateUserStatus} />
        )}
        {section === "shops" && hasPermission("manage_merchants") && (
          <Shops shops={shops} users={users} verifyShop={verifyShop} />
        )}
        {section === "products" && hasPermission("manage_products") && (
          <Products products={products} />
        )}
        {section === "orders" && hasPermission("manage_orders") && (
          <Orders orders={orders} openStatusUpdate={openStatusUpdate} />
        )}
        {section === "sales" && hasPermission("view_sales") && (
          <Sales orders={orders} totalGMV={totalGMV} totalItemsSold={totalItemsSold} />
        )}
        {section === "support" && hasPermission("manage_support") && (
          <SupportPanel />
        )}
      </main>

      {selectedAdmin && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2>Administrator Permissions</h2>
                <p>{selectedAdmin.name || selectedAdmin.email}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedAdmin(null)}>
                ×
              </button>
            </div>

            <div className="permission-list">
              {PERMISSIONS.map(([key, label]) => {
                const checked = selectedAdminPermissions.includes(key);
                return (
                  <label className="permission" key={key}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedAdminPermissions((prev) =>
                          checked ? prev.filter((p) => p !== key) : [...prev, key]
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>

            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setSelectedAdmin(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={saveAdminPermissions}>
                Save Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {statusUpdateOrder && (
        <OrderStatusUpdateModal
          order={statusUpdateOrder}
          onClose={() => setStatusUpdateOrder(null)}
          status={statusUpdateStatus} setStatus={setStatusUpdateStatus}
          courier={statusUpdateCourier} setCourier={setStatusUpdateCourier}
          tracking={statusUpdateTracking} setTracking={setStatusUpdateTracking}
          note={statusUpdateNote} setNote={setStatusUpdateNote}
          onSubmit={updateOrderTracking}
        />
      )}
    </div>
  );
}

/* =====================================================
   ADMIN SECTIONS
===================================================== */

function Overview({ users, shops, products, orders, totalGMV, totalItemsSold }) {
  const merchants = users.filter((u) => u.role === "merchant");
  const customers = users.filter((u) => u.role === "customer");

  return (
    <div>
      <div className="stats-grid">
        <Stat title="Total Users" value={users.length} />
        <Stat title="Merchants" value={merchants.length} />
        <Stat title="Customers" value={customers.length} />
        <Stat title="Shops" value={shops.length} />
        <Stat title="Products" value={products.length} />
        <Stat title="Orders" value={orders.length} />
        <Stat title="Items Sold" value={totalItemsSold} />
        <Stat title="GMV" value={formatMoney(totalGMV)} />
      </div>

      <div className="content-grid">
        <div className="panel">
          <PanelHeader
            title="Platform Summary"
            description="Current LocalShop platform activity."
          />
          <div className="summary-list">
            <SummaryRow
              label="Active Shops"
              value={shops.filter((s) => s.status === "active" || !s.status).length}
            />
            <SummaryRow
              label="Verified Shops"
              value={shops.filter((s) => s.verificationStatus === "verified").length}
            />
            <SummaryRow
              label="Pending Shops"
              value={
                shops.filter(
                  (s) => s.status === "pending" || s.verificationStatus === "pending"
                ).length
              }
            />
            <SummaryRow
              label="Pending Orders"
              value={orders.filter((o) => o.orderStatus === "pending").length}
            />
          </div>
        </div>

        <div className="panel">
          <PanelHeader title="Recent Orders" description="Latest platform orders." />
          {orders.length === 0 ? (
            <EmptyState text="No orders yet." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Shop</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...orders].slice(-5).reverse().map((order) => (
                    <tr key={order.id}>
                      <td>{order.customerName || order.customerEmail || "Customer"}</td>
                      <td>{order.shopName || "Shop"}</td>
                      <td>{formatMoney(order.total)}</td>
                      <td><Badge status={order.orderStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Administrators({
  profile, users, promoteToAdmin, revokeAdmin, openPermissionEditor,
  invites, inviteEmail, setInviteEmail, invitePermissions, setInvitePermissions,
  sendAdminInvite, cancelInvite,
}) {
  const admins = users.filter((u) => u.role === "admin");
  const availableUsers = users.filter((u) => u.role !== "owner" && u.role !== "admin");
  const pendingInvites = (invites || []).filter((i) => i.status === "pending");
  const appUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";

  return (
    <div>
      <PageTitle
        title="Administrators"
        description="Administrators are controlled by the Owner."
      />

      {profile.role === "owner" && (
        <div className="panel">
          <PanelHeader
            title="Invite Admin by Email"
            description="ইমেইল দিয়ে Admin ইনভাইট পাঠান — সেই ইমেইলে যেই রেজিস্ট্রেশন/লগইন করবে সে-ই Admin হয়ে যাবে, নির্বাচিত permissions সহ।"
          />
          <form onSubmit={sendAdminInvite} className="invite-form">
            <label>Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="admin@example.com"
              required
            />

            <label>Permissions</label>
            <div className="permission-list">
              {PERMISSIONS.map(([key, label]) => {
                const checked = invitePermissions.includes(key);
                return (
                  <label className="permission" key={key}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setInvitePermissions((prev) =>
                          checked ? prev.filter((p) => p !== key) : [...prev, key]
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>

            <button className="btn primary full" type="submit" style={{ marginTop: 14 }}>
              Send Invite
            </button>
          </form>
        </div>
      )}

      {profile.role === "owner" && (
        <div className="panel">
          <PanelHeader
            title="Pending Invites"
            description={`${pendingInvites.length} invite(s) waiting to be accepted.`}
          />
          {pendingInvites.length === 0 ? (
            <EmptyState text="No pending invites." />
          ) : (
            <div className="user-select-grid">
              {pendingInvites.map((inv) => (
                <div className="user-card invite-card" key={inv.id}>
                  <div>
                    <strong>{inv.email}</strong>
                    <span>
                      {(inv.permissions || []).length
                        ? inv.permissions.map((p) => p.replaceAll("_", " ")).join(", ")
                        : "No permissions selected"}
                    </span>
                  </div>
                  <div className="actions">
                    <a
                      className="btn small secondary"
                      href={`mailto:${inv.email}?subject=${encodeURIComponent("LocalShop Administrator Invitation")}&body=${encodeURIComponent(`আপনাকে LocalShop প্ল্যাটফর্মে Administrator হিসেবে আমন্ত্রণ জানানো হয়েছে।\n\nএই লিংকে গিয়ে এই ইমেইল (${inv.email}) দিয়ে রেজিস্ট্রেশন বা লগইন করুন, আপনি স্বয়ংক্রিয়ভাবে Admin অ্যাক্সেস পেয়ে যাবেন:\n${appUrl}`)}`}
                    >
                      Email
                    </a>
                    <a
                      className="btn small secondary"
                      href={`https://wa.me/?text=${encodeURIComponent(`আপনাকে LocalShop Administrator হিসেবে আমন্ত্রণ জানানো হয়েছে। এই ইমেইল (${inv.email}) দিয়ে রেজিস্ট্রেশন/লগইন করুন: ${appUrl}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                    <button className="btn small danger" onClick={() => cancelInvite(inv.id)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <PanelHeader
          title="Current Administrators"
          description={`${admins.length} administrator account(s)`}
        />

        {admins.length === 0 ? (
          <EmptyState text="No administrators assigned yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  {profile.role === "owner" && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td><strong>{admin.name || "Administrator"}</strong></td>
                    <td>{admin.email}</td>
                    <td>
                      <div className="permission-tags">
                        {admin.permissions?.length ? (
                          admin.permissions.map((p) => (
                            <span key={p} className="tag">
                              {p.replaceAll("_", " ")}
                            </span>
                          ))
                        ) : (
                          <span className="muted">No permissions</span>
                        )}
                      </div>
                    </td>
                    <td><Badge status={admin.status || "active"} /></td>
                    {profile.role === "owner" && (
                      <td>
                        <div className="actions">
                          <button
                            className="btn small secondary"
                            onClick={() => openPermissionEditor(admin)}
                          >
                            Permissions
                          </button>
                          <button
                            className="btn small danger"
                            onClick={() => revokeAdmin(admin)}
                          >
                            Revoke
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {profile.role === "owner" && (
        <div className="panel">
          <PanelHeader
            title="Promote Existing User"
            description="Instantly make an existing LocalShop user an Administrator."
          />
          {availableUsers.length === 0 ? (
            <EmptyState text="No eligible users available." />
          ) : (
            <div className="user-select-grid">
              {availableUsers.map((user) => (
                <div className="user-card" key={user.id}>
                  <div>
                    <strong>{user.name || user.email}</strong>
                    <span>{roleLabel(user.role)}</span>
                  </div>
                  <button
                    className="btn small primary"
                    onClick={() => promoteToAdmin(user)}
                  >
                    Make Admin
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Merchants({ users, shops, updateUserStatus, verifyShop }) {
  const merchants = users.filter((u) => u.role === "merchant");

  return (
    <div>
      <PageTitle
        title="Merchants"
        description="Monitor merchant accounts, shops, and verification."
      />
      <div className="panel">
        {merchants.length === 0 ? (
          <EmptyState text="No merchant accounts found." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Email</th>
                  <th>Shop</th>
                  <th>Account</th>
                  <th>Verification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {merchants.map((merchant) => {
                  const merchantShop = shops.find(
                    (s) => s.ownerId === merchant.id || s.id === merchant.id
                  );
                  return (
                    <tr key={merchant.id}>
                      <td><strong>{merchant.name || "Merchant"}</strong></td>
                      <td>{merchant.email}</td>
                      <td>{merchantShop?.shopName || "No shop"}</td>
                      <td><Badge status={merchant.status || "active"} /></td>
                      <td>
                        <Badge status={merchantShop?.verificationStatus || "pending"} />
                      </td>
                      <td>
                        <div className="actions">
                          {merchant.status !== "active" && (
                            <button
                              className="btn small success"
                              onClick={() => updateUserStatus(merchant.id, "active")}
                            >
                              Activate
                            </button>
                          )}
                          {merchant.status !== "suspended" && (
                            <button
                              className="btn small secondary"
                              onClick={() => updateUserStatus(merchant.id, "suspended")}
                            >
                              Suspend
                            </button>
                          )}
                          {merchant.status !== "banned" && (
                            <button
                              className="btn small danger"
                              onClick={() => updateUserStatus(merchant.id, "banned")}
                            >
                              Ban
                            </button>
                          )}
                          {merchantShop &&
                            merchantShop.verificationStatus !== "verified" && (
                              <button
                                className="btn small primary"
                                onClick={() =>
                                  verifyShop(merchantShop.id, "verified")
                                }
                              >
                                Verify Shop
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Customers({ users, updateUserStatus }) {
  const customers = users.filter((u) => u.role === "customer");

  return (
    <div>
      <PageTitle title="Customers" description="Manage LocalShop customer accounts." />
      <div className="panel">
        {customers.length === 0 ? (
          <EmptyState text="No customer accounts found." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td><strong>{customer.name || "Customer"}</strong></td>
                    <td>{customer.email}</td>
                    <td>{customer.phone || "—"}</td>
                    <td><Badge status={customer.status || "active"} /></td>
                    <td>
                      <div className="actions">
                        {customer.status !== "active" && (
                          <button
                            className="btn small success"
                            onClick={() => updateUserStatus(customer.id, "active")}
                          >
                            Activate
                          </button>
                        )}
                        {customer.status !== "suspended" && (
                          <button
                            className="btn small secondary"
                            onClick={() => updateUserStatus(customer.id, "suspended")}
                          >
                            Suspend
                          </button>
                        )}
                        {customer.status !== "banned" && (
                          <button
                            className="btn small danger"
                            onClick={() => updateUserStatus(customer.id, "banned")}
                          >
                            Ban
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Shops({ shops, users, verifyShop }) {
  return (
    <div>
      <PageTitle
        title="Shops"
        description="Review merchant storefronts and verification status."
      />
      <div className="panel">
        {shops.length === 0 ? (
          <EmptyState text="No shops found." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Owner</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Verification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => {
                  const owner = users.find((u) => u.id === shop.ownerId);
                  return (
                    <tr key={shop.id}>
                      <td>
                        <strong>{shop.shopName || "Unnamed Shop"}</strong>
                        <small>{shop.shopAddress || "No address"}</small>
                      </td>
                      <td>{owner?.name || owner?.email || shop.ownerEmail || "—"}</td>
                      <td>{shop.shopPhone || shop.phone || "—"}</td>
                      <td><Badge status={shop.status || "pending"} /></td>
                      <td><Badge status={shop.verificationStatus || "pending"} /></td>
                      <td>
                        <div className="actions">
                          {shop.verificationStatus !== "verified" && (
                            <button
                              className="btn small primary"
                              onClick={() => verifyShop(shop.id, "verified")}
                            >
                              Verify
                            </button>
                          )}
                          {shop.verificationStatus !== "rejected" && (
                            <button
                              className="btn small danger"
                              onClick={() => verifyShop(shop.id, "rejected")}
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Products({ products }) {
  return (
    <div>
      <PageTitle
        title="Products"
        description="Monitor products across the LocalShop marketplace."
      />
      <div className="panel">
        {products.length === 0 ? (
          <EmptyState text="No products found." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Quantity</th>
                  <th>Merchant</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.productName}</strong>
                      <small>{product.description || "No description"}</small>
                    </td>
                    <td>{formatMoney(product.price)}</td>
                    <td>{Number(product.quantity || 0)}</td>
                    <td>{product.ownerId || "—"}</td>
                    <td><Badge status={product.status || "active"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Orders({ orders, openStatusUpdate }) {
  return (
    <div>
      <PageTitle title="Orders" description="Monitor marketplace orders and update delivery tracking." />
      <div className="panel">
        {orders.length === 0 ? (
          <EmptyState text="No orders found." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Merchant</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...orders].reverse().map((order) => (
                  <tr key={order.id}>
                    <td><strong>#{order.id.slice(0, 8)}</strong></td>
                    <td>{order.customerName || order.customerEmail || "Customer"}</td>
                    <td>{order.shopName || order.merchantId || "Merchant"}</td>
                    <td>{formatMoney(order.total)}</td>
                    <td>{order.paymentMethod || "—"}</td>
                    <td><Badge status={order.orderStatus || "pending"} /></td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
                      {order.orderStatus !== "cancelled" && (
                        <button className="btn small primary" onClick={() => openStatusUpdate(order)}>
                          Update Status
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Sales({ orders, totalGMV, totalItemsSold }) {
  const completed = orders.filter(
    (o) => !["cancelled", "refunded"].includes(o.orderStatus)
  );
  const averageOrder = completed.length ? totalGMV / completed.length : 0;

  return (
    <div>
      <PageTitle title="Sales" description="Marketplace sales and revenue overview." />
      <div className="stats-grid">
        <Stat title="Gross Merchandise Value" value={formatMoney(totalGMV)} />
        <Stat title="Orders" value={completed.length} />
        <Stat title="Items Sold" value={totalItemsSold} />
        <Stat title="Average Order" value={formatMoney(averageOrder)} />
      </div>
      <div className="panel">
        <PanelHeader
          title="Sales Note"
          description="Revenue metrics are calculated from Firestore orders."
        />
        <p className="muted">
          For production, payment confirmation, refunds, and revenue calculations
          should be validated by a trusted backend service.
        </p>
      </div>
    </div>
  );
}

function SupportPanel() {
  return (
    <div>
      <PageTitle title="Help & Support" description="Contact LocalShop administration." />
      <SupportLinks />
    </div>
  );
}

/* =====================================================
   MERCHANT DASHBOARD
===================================================== */

function MerchantDashboard(props) {
  const {
    profile, shop, products, orders,
    section, setSection,
    openShopForm, openAddProduct, openEditProduct, deleteProduct,
    showShopForm, setShowShopForm, saveShop,
    shopName, setShopName, shopDescription, setShopDescription,
    shopPhone, setShopPhone, shopAddress, setShopAddress,
    showProductForm, setShowProductForm, editingProduct,
    productName, setProductName, productPrice, setProductPrice,
    productQuantity, setProductQuantity, productDescription, setProductDescription,
    productImage, setProductImage, saveProduct,
    error, message, logout,
    openStatusUpdate, statusUpdateOrder, setStatusUpdateOrder,
    statusUpdateStatus, setStatusUpdateStatus,
    statusUpdateCourier, setStatusUpdateCourier,
    statusUpdateTracking, setStatusUpdateTracking,
    statusUpdateNote, setStatusUpdateNote,
    updateOrderTracking,
  } = props;

  const sales = orders.reduce(
    (sum, o) => sum + Number(o.orderStatus === "cancelled" ? 0 : o.total || 0),
    0
  );

  const pendingOrders = orders.filter((o) => o.orderStatus === "pending");
  const completedForAvg = orders.filter((o) => !["cancelled", "refunded"].includes(o.orderStatus));
  const averageOrder = completedForAvg.length ? sales / completedForAvg.length : 0;
  const itemsSold = orders.reduce(
    (sum, o) => sum + (o.items || []).reduce((s, item) => s + Number(item.quantity || 0), 0),
    0
  );

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">LS</div>
          <div>
            <strong>LocalShop</strong>
            <span>Merchant Center</span>
          </div>
        </div>

        <nav>
          <div className="nav-section">Merchant</div>
          {[
            ["dashboard", "Dashboard"],
            ["shop", "My Shop"],
            ["products", "Products"],
            ["orders", "Orders"],
            ["sales", "Sales"],
            ["support", "Help & Support"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={section === id ? "nav-item active" : "nav-item"}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="role-box">
            <strong>{profile.name || profile.email}</strong>
            <span>Merchant</span>
          </div>
          <button className="nav-item logout-nav" onClick={logout}>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>
              {section === "dashboard" && "Merchant Dashboard"}
              {section === "shop" && "My Shop"}
              {section === "products" && "Products"}
              {section === "orders" && "Orders"}
              {section === "sales" && "Sales"}
              {section === "support" && "Help & Support"}
            </h1>
            <p>Manage your shop, products, orders and live delivery tracking.</p>
          </div>
          <Badge status={profile.status || "active"} />
        </header>

        {error && <div className="alert danger">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        {/* Dashboard Overview */}
        {section === "dashboard" && (
          <>
            <div className="stats-grid">
              <Stat title="Products" value={products.length} />
              <Stat title="Total Orders" value={orders.length} />
              <Stat title="Pending Orders" value={pendingOrders.length} />
              <Stat title="Total Sales" value={formatMoney(sales)} />
            </div>

            <div className="content-grid">
              <div className="panel">
                <PanelHeader title="Shop Status" description="Your merchant storefront." />
                {shop ? (
                  <>
                    <h2 className="shop-name">{shop.shopName}</h2>
                    <p className="muted">{shop.shopDescription || "No description"}</p>
                    <div className="shop-meta">
                      <span>{shop.shopPhone || "No phone"}</span>
                      <span>{shop.shopAddress || "No address"}</span>
                    </div>
                    <div className="shop-badges">
                      <Badge status={shop.status || "pending"} />
                      <Badge status={shop.verificationStatus || "pending"} />
                    </div>
                    <div className="actions" style={{ marginTop: 14 }}>
                      <button className="btn primary" onClick={openShopForm}>
                        Edit Shop
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <EmptyState text="You have not created your shop yet." />
                    <button className="btn primary" onClick={openShopForm}>
                      Create Shop
                    </button>
                  </>
                )}
              </div>

              <div className="panel">
                <PanelHeader title="Recent Orders" description="Latest orders for your shop." />
                {orders.length === 0 ? (
                  <EmptyState text="No orders yet." />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Customer</th>
                          <th>Total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...orders].slice(-5).reverse().map((order) => (
                          <tr key={order.id}>
                            <td>#{order.id.slice(0, 8)}</td>
                            <td>{order.customerName || "Customer"}</td>
                            <td>{formatMoney(order.total)}</td>
                            <td><Badge status={order.orderStatus} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Shop Section */}
        {section === "shop" && (
          <div className="panel">
            <PanelHeader title="My Shop" description="Your merchant storefront details." />
            {shop ? (
              <>
                <h2 className="shop-name">{shop.shopName}</h2>
                <p className="muted">{shop.shopDescription || "No description"}</p>
                <div className="shop-meta">
                  <span>{shop.shopPhone || "No phone"}</span>
                  <span>{shop.shopAddress || "No address"}</span>
                </div>
                <div className="shop-badges">
                  <Badge status={shop.status || "pending"} />
                  <Badge status={shop.verificationStatus || "pending"} />
                </div>
                <div className="actions" style={{ marginTop: 14 }}>
                  <button className="btn primary" onClick={openShopForm}>
                    Edit Shop
                  </button>
                </div>
              </>
            ) : (
              <>
                <EmptyState text="You have not created your shop yet." />
                <button className="btn primary" onClick={openShopForm}>
                  Create Shop
                </button>
              </>
            )}
          </div>
        )}

        {/* Products Section */}
        {section === "products" && (
          <div className="panel">
            <div className="panel-header-row">
              <PanelHeader
                title="Products"
                description={`${products.length} product(s) in your catalog.`}
              />
              <button className="btn primary" onClick={openAddProduct}>
                + Add Product
              </button>
            </div>

            {products.length === 0 ? (
              <EmptyState text="No products yet. Add your first product." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Price</th>
                      <th>Qty</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <strong>{product.productName}</strong>
                          <small>{product.description || "No description"}</small>
                        </td>
                        <td>{formatMoney(product.price)}</td>
                        <td>{Number(product.quantity || 0)}</td>
                        <td><Badge status={product.status || "active"} /></td>
                        <td>
                          <div className="actions">
                            <button
                              className="btn small secondary"
                              onClick={() => openEditProduct(product)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn small danger"
                              onClick={() => deleteProduct(product.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Orders Section */}
        {section === "orders" && (
          <div className="panel">
            <PanelHeader
              title="Orders"
              description={`${orders.length} total order(s). Update status to keep customers' live tracking accurate.`}
            />
            {orders.length === 0 ? (
              <EmptyState text="No orders yet." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Total</th>
                      <th>Payment</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...orders].reverse().map((order) => (
                      <tr key={order.id}>
                        <td><strong>#{order.id.slice(0, 8)}</strong></td>
                        <td>{order.customerName || "Customer"}</td>
                        <td>{order.phone || "—"}</td>
                        <td>{formatMoney(order.total)}</td>
                        <td>{order.paymentMethod || "—"}</td>
                        <td><Badge status={order.orderStatus} /></td>
                        <td>{formatDate(order.createdAt)}</td>
                        <td>
                          {order.orderStatus !== "cancelled" && (
                            <button className="btn small primary" onClick={() => openStatusUpdate(order)}>
                              Update Status
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Sales Section */}
        {section === "sales" && (
          <div>
            <div className="stats-grid">
              <Stat title="Total Sales" value={formatMoney(sales)} />
              <Stat title="Orders" value={completedForAvg.length} />
              <Stat title="Items Sold" value={itemsSold} />
              <Stat title="Average Order" value={formatMoney(averageOrder)} />
            </div>
            <div className="panel">
              <PanelHeader title="Recent Sales" description="Latest completed and in-progress orders." />
              {orders.length === 0 ? (
                <EmptyState text="No sales yet." />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Items</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...orders].reverse().map((order) => (
                        <tr key={order.id}>
                          <td>#{order.id.slice(0, 8)}</td>
                          <td>{(order.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0)}</td>
                          <td>{formatMoney(order.total)}</td>
                          <td><Badge status={order.orderStatus} /></td>
                          <td>{formatDate(order.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Support Section */}
        {section === "support" && (
          <div>
            <PageTitle title="Help & Support" description="Contact LocalShop support." />
            <SupportLinks />
          </div>
        )}

        {/* Shop Form Modal */}
        {showShopForm && (
          <Modal title={shop ? "Edit Shop" : "Create Shop"} onClose={() => setShowShopForm(false)}>
            <form onSubmit={saveShop}>
              <label>Shop Name</label>
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Your shop name"
                required
              />

              <label>Description</label>
              <textarea
                value={shopDescription}
                onChange={(e) => setShopDescription(e.target.value)}
                placeholder="Describe your shop..."
              />

              <label>Phone</label>
              <input
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
                placeholder="Shop phone number"
              />

              <label>Address</label>
              <input
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="Shop address"
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowShopForm(false)}
                >
                  Cancel
                </button>
                <button className="btn primary" type="submit">
                  Save Shop
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Product Form Modal */}
        {showProductForm && (
          <Modal
            title={editingProduct ? "Edit Product" : "Add Product"}
            onClose={() => setShowProductForm(false)}
          >
            <form onSubmit={saveProduct}>
              <label>Product Name</label>
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Product name"
                required
              />

              <label>Price (৳)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                placeholder="0.00"
                required
              />

              <label>Quantity</label>
              <input
                type="number"
                min="0"
                value={productQuantity}
                onChange={(e) => setProductQuantity(e.target.value)}
                placeholder="0"
              />

              <label>Description</label>
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="Product description..."
              />

              <label>Image URL</label>
              <input
                type="url"
                value={productImage}
                onChange={(e) => setProductImage(e.target.value)}
                placeholder="https://..."
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowProductForm(false)}
                >
                  Cancel
                </button>
                <button className="btn primary" type="submit">
                  {editingProduct ? "Update Product" : "Add Product"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Order Status / Tracking Update Modal */}
        {statusUpdateOrder && (
          <OrderStatusUpdateModal
            order={statusUpdateOrder}
            onClose={() => setStatusUpdateOrder(null)}
            status={statusUpdateStatus} setStatus={setStatusUpdateStatus}
            courier={statusUpdateCourier} setCourier={setStatusUpdateCourier}
            tracking={statusUpdateTracking} setTracking={setStatusUpdateTracking}
            note={statusUpdateNote} setNote={setStatusUpdateNote}
            onSubmit={updateOrderTracking}
          />
        )}
      </main>
    </div>
  );
}

/* =====================================================
   CUSTOMER DASHBOARD
===================================================== */

function CustomerDashboard({
  profile, products, shops, orders,
  section, setSection,
  cart, cartTotal,
  addToCart, removeFromCart, updateCartQuantity,
  checkoutOpen, setCheckoutOpen,
  checkoutPhone, setCheckoutPhone,
  checkoutAddress, setCheckoutAddress,
  paymentMethod, setPaymentMethod,
  placeOrder, logout, error, message,
  trackingOrder, setTrackingOrder,
}) {
  const activeShops = shops.filter(
    (s) =>
      s.status === "active" &&
      s.verificationStatus === "verified"
  );

  const activeProducts = products.filter(
    (p) =>
      p.status !== "hidden" &&
      Number(p.quantity || 0) > 0 &&
      activeShops.some((s) => s.id === p.shopId)
  );

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">LS</div>
          <div>
            <strong>LocalShop</strong>
            <span>Customer</span>
          </div>
        </div>

        <nav>
          {[
            ["marketplace", "Marketplace"],
            ["my-orders", "My Orders"],
            ["support", "Help & Support"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={section === id ? "nav-item active" : "nav-item"}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="role-box">
            <strong>{profile.name || profile.email}</strong>
            <span>Customer</span>
          </div>
          <button className="nav-item logout-nav" onClick={logout}>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>
              {section === "marketplace" && "Marketplace"}
              {section === "my-orders" && "My Orders"}
              {section === "support" && "Help & Support"}
            </h1>
            <p>
              {section === "marketplace" && "Discover products from LocalShop merchants."}
              {section === "my-orders" && "Track your LocalShop purchases live."}
              {section === "support" && "Get help from LocalShop support."}
            </p>
          </div>
          <button
            className="btn primary cart-btn"
            onClick={() => setCheckoutOpen(true)}
          >
            Cart
            {cart.length > 0 && (
              <span className="cart-count">{cart.length}</span>
            )}
          </button>
        </header>

        {error && <div className="alert danger">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        {/* Marketplace */}
        {section === "marketplace" && (
          <>
            <section>
              <PageTitle
                title="Featured Shops"
                description="Explore local merchants."
              />
              {activeShops.length === 0 ? (
                <EmptyState text="No shops available yet." />
              ) : (
                <div className="shop-grid">
                  {activeShops.map((s) => (
                    <div className="shop-card" key={s.id}>
                      <strong>{s.shopName || "Local Shop"}</strong>
                      <p>{s.shopDescription || s.description || "Local merchant"}</p>
                      <Badge status={s.verificationStatus || "pending"} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="section-gap">
              <PageTitle
                title="Products"
                description="Shop from verified local merchants."
              />
              {activeProducts.length === 0 ? (
                <EmptyState text="No products available right now." />
              ) : (
                <div className="market-grid">
                  {activeProducts.map((product) => (
                    <div className="market-product" key={product.id}>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.productName} />
                      ) : (
                        <div className="image-placeholder">LocalShop</div>
                      )}
                      <div className="market-product-body">
                        <span className="product-eyebrow">Local Product</span>
                        <h3>{product.productName}</h3>
                        <p>{product.description || "No description"}</p>
                        <div className="product-bottom">
                          <strong>{formatMoney(product.price)}</strong>
                          <button
                            className="btn small primary"
                            onClick={() => addToCart(product)}
                          >
                            Add to Cart
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* My Orders */}
        {section === "my-orders" && (
          <div className="panel">
            {orders.length === 0 ? (
              <EmptyState text="You have not placed any orders yet." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Shop</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Tracking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...orders].reverse().map((order) => (
                      <tr key={order.id}>
                        <td>#{order.id.slice(0, 8)}</td>
                        <td>{order.shopName}</td>
                        <td>{formatMoney(order.total)}</td>
                        <td><Badge status={order.orderStatus} /></td>
                        <td>{formatDate(order.createdAt)}</td>
                        <td>
                          <button className="btn small secondary" onClick={() => setTrackingOrder(order)}>
                            Track Order
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Support */}
        {section === "support" && <SupportLinks />}

        {/* Tracking Modal (live) */}
        {trackingOrder && (
          <Modal title={`Track Order #${trackingOrder.id.slice(0, 8)}`} onClose={() => setTrackingOrder(null)}>
            <OrderTrackingTimeline
              order={orders.find((o) => o.id === trackingOrder.id) || trackingOrder}
            />
          </Modal>
        )}

        {/* Checkout Modal */}
        {checkoutOpen && (
          <Modal title="Checkout" onClose={() => setCheckoutOpen(false)}>
            <div className="checkout-summary">
              <strong>Order Total</strong>
              <span>{formatMoney(cartTotal)}</span>
            </div>

            {cart.length === 0 ? (
              <EmptyState text="Your cart is empty." />
            ) : (
              <div className="cart-items">
                {cart.map((item) => (
                  <div className="cart-row" key={item.productId}>
                    <div>
                      <strong>{item.productName}</strong>
                      <span>
                        {formatMoney(item.price)} × {item.quantity} ={" "}
                        {formatMoney(item.price * item.quantity)}
                      </span>
                    </div>
                    <div className="cart-qty">
                      <button
                        className="btn small secondary"
                        onClick={() => updateCartQuantity(item.productId, -1)}
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        className="btn small secondary"
                        onClick={() => updateCartQuantity(item.productId, 1)}
                      >
                        +
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => removeFromCart(item.productId)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <form onSubmit={placeOrder}>
                <label>Phone</label>
                <input
                  value={checkoutPhone}
                  onChange={(e) => setCheckoutPhone(e.target.value)}
                  placeholder="Your phone number"
                  required
                />

                <label>Delivery Address</label>
                <textarea
                  value={checkoutAddress}
                  onChange={(e) => setCheckoutAddress(e.target.value)}
                  placeholder="Full delivery address"
                  required
                />

                <label>Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option>Cash on Delivery</option>
                  <option>Online Payment</option>
                </select>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setCheckoutOpen(false)}
                  >
                    Cancel
                  </button>
                  <button className="btn primary" type="submit">
                    Place Order
                  </button>
                </div>
              </form>
            )}
          </Modal>
        )}
      </main>
    </div>
  );
}

/* =====================================================
   ORDER TRACKING TIMELINE (shared: merchant + customer)
===================================================== */

function OrderTrackingTimeline({ order }) {
  if (!order) return null;

  if (order.orderStatus === "cancelled") {
    return <div className="alert danger">এই অর্ডারটি বাতিল হয়ে গেছে।</div>;
  }

  const currentIndex = ORDER_STATUSES.findIndex(([key]) => key === order.orderStatus);
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];

  return (
    <div>
      <div className="tracking-timeline">
        {ORDER_STATUSES.map(([key, label], idx) => {
          const done = currentIndex >= 0 && idx <= currentIndex;
          const histEntry = [...history].reverse().find((h) => h.status === key);
          return (
            <div className={`tracking-step ${done ? "done" : ""}`} key={key}>
              <div className="tracking-dot" />
              <div className="tracking-step-body">
                <strong>{label}</strong>
                {histEntry?.updatedAt && (
                  <span>{formatDateTime(histEntry.updatedAt)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(order.courierName || order.trackingCode) && (
        <div className="tracking-courier">
          {order.courierName && (
            <span><strong>কুরিয়ার:</strong> {order.courierName}</span>
          )}
          {order.trackingCode && (
            <span><strong>ট্র্যাকিং কোড:</strong> {order.trackingCode}</span>
          )}
        </div>
      )}
    </div>
  );
}

function OrderStatusUpdateModal({
  order, onClose,
  status, setStatus,
  courier, setCourier,
  tracking, setTracking,
  note, setNote,
  onSubmit,
}) {
  return (
    <Modal title={`Update Order #${order.id.slice(0, 8)}`} onClose={onClose}>
      <OrderTrackingTimeline order={order} />

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {ORDER_STATUSES.map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
          <option value="cancelled">Cancelled</option>
        </select>

        <label>Courier Name (optional)</label>
        <input
          value={courier}
          onChange={(e) => setCourier(e.target.value)}
          placeholder="e.g. Pathao, Steadfast, own rider"
        />

        <label>Tracking Code (optional)</label>
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="Courier tracking / consignment ID"
        />

        <label>Note (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note for this update"
        />

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="submit">
            Save Update
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* =====================================================
   SHARED / SMALL COMPONENTS
===================================================== */

function LoadingScreen() {
  return (
    <div className="app">
      <div className="center-screen">
        <div className="loading-card">
          <div className="brand-mark">LS</div>
          <h2>Loading LocalShop</h2>
          <p className="muted">Checking your account...</p>
          <div className="loader" />
        </div>
      </div>
    </div>
  );
}

function Stat({ title, value }) {
  return (
    <div className="stat-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PageTitle({ title, description }) {
  return (
    <div className="page-title">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

function PanelHeader({ title, description }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Badge({ status }) {
  return (
    <span className={`badge ${statusClass(status)}`}>
      {String(status || "unknown").replaceAll("_", " ")}
    </span>
  );
}

function EmptyState({ text }) {
  return (
    <div className="empty">
      <strong>{text}</strong>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SupportLinks() {
  return (
    <div className="support-grid">
      <a
        className="support-card"
        href={`https://wa.me/${SUPPORT.whatsapp}`}
        target="_blank"
        rel="noreferrer"
      >
        <strong>WhatsApp</strong>
        <span>Chat with support</span>
      </a>
      <a className="support-card" href={`tel:${SUPPORT.phone}`}>
        <strong>Phone</strong>
        <span>{SUPPORT.phone}</span>
      </a>
      <a className="support-card" href={`mailto:${SUPPORT.email}`}>
        <strong>Email</strong>
        <span>{SUPPORT.email}</span>
      </a>
    </div>
  );
}

/* =====================================================
   CSS
===================================================== */

const css = `
*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f6f8fb;
  color: #172033;
  -webkit-font-smoothing: antialiased;
}

button, input, textarea, select {
  font: inherit;
}

button, a {
  -webkit-tap-highlight-color: transparent;
}

button {
  cursor: pointer;
}

a {
  text-decoration: none;
}

/* ── App Shell ── */
.app {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(37,99,235,.08), transparent 35%),
    #f6f8fb;
}

.center-screen {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
}

/* ── Auth Card ── */
.auth-card,
.loading-card {
  width: 100%;
  max-width: 440px;
  background: white;
  border: 1px solid #e7ebf2;
  border-radius: 22px;
  padding: 34px;
  box-shadow: 0 20px 60px rgba(20,35,65,.09);
}

.loading-card {
  text-align: center;
}

.brand-mark {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: #172033;
  color: white;
  font-weight: 800;
  letter-spacing: -.04em;
  margin-bottom: 18px;
}

.brand-mark.small {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  margin: 0;
}

.auth-card h1 {
  margin: 0;
  font-size: 30px;
  letter-spacing: -.04em;
}

.auth-card h2 {
  margin: 26px 0 8px;
  font-size: 22px;
}

.muted {
  color: #687386;
  line-height: 1.6;
}

label {
  display: block;
  margin: 16px 0 7px;
  font-size: 13px;
  font-weight: 700;
  color: #3b4659;
}

input, textarea, select {
  width: 100%;
  border: 1px solid #dfe5ee;
  background: #fff;
  border-radius: 11px;
  padding: 12px 13px;
  outline: none;
  color: #172033;
  transition: border-color .15s, box-shadow .15s;
}

input:focus, textarea:focus, select:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37,99,235,.09);
}

textarea {
  min-height: 100px;
  resize: vertical;
}

.password-wrap {
  position: relative;
}

.password-wrap input {
  padding-right: 70px;
}

.password-toggle {
  position: absolute;
  right: 7px;
  top: 7px;
  border: 0;
  background: #eef2f7;
  color: #344054;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 700;
}

.auth-tabs {
  display: flex;
  gap: 6px;
  background: #f1f4f8;
  padding: 5px;
  border-radius: 11px;
  margin: 22px 0;
}

.auth-tabs button {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 10px;
  border-radius: 8px;
  color: #687386;
  font-weight: 700;
  transition: background .15s, color .15s;
}

.auth-tabs button.active {
  background: white;
  color: #172033;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
}

/* ── Buttons ── */
.btn {
  border: 0;
  border-radius: 10px;
  padding: 11px 15px;
  font-weight: 700;
  transition: opacity .15s, transform .1s;
}

.btn:hover {
  opacity: .88;
}

.btn:active {
  transform: scale(.97);
}

.btn.primary {
  background: #2563eb;
  color: white;
}

.btn.secondary {
  background: #eef2f7;
  color: #344054;
}

.btn.success {
  background: #e9f8ef;
  color: #137333;
}

.btn.danger {
  background: #fff0f0;
  color: #c62828;
}

.btn.small {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 8px;
}

.btn.full {
  width: 100%;
  margin-top: 20px;
}

/* ── Alerts ── */
.alert {
  padding: 12px 14px;
  border-radius: 10px;
  margin: 14px 0;
  font-size: 14px;
  line-height: 1.5;
}

.alert.success {
  background: #eaf8ef;
  color: #176b38;
}

.alert.danger {
  background: #fff0f0;
  color: #b42318;
}

.auth-forgot {
  display: block;
  width: 100%;
  margin-top: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  cursor: pointer;
}

.auth-forgot:hover {
  text-decoration: underline;
}

.auth-support {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #edf0f5;
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.auth-support a {
  color: #2563eb;
  font-weight: 700;
}

/* ── Guest Storefront ── */
.guest-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: white;
  border-bottom: 1px solid #e5e9f0;
}

.guest-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.guest-brand strong {
  display: block;
  font-size: 15px;
}

.guest-brand span {
  display: block;
  margin-top: 2px;
  color: #687386;
  font-size: 11px;
}

.guest-actions {
  display: flex;
  gap: 10px;
}

.guest-main {
  max-width: 1180px;
  margin: 0 auto;
  padding: 26px 28px 60px;
}

.guest-checkout-prompt {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #eef1f5;
  text-align: center;
}

/* ── Dashboard Layout ── */
.dashboard {
  min-height: 100vh;
  display: flex;
}

.sidebar {
  width: 250px;
  background: #111827;
  color: white;
  padding: 20px 14px;
  display: flex;
  flex-direction: column;
  position: fixed;
  inset: 0 auto 0 0;
  overflow-y: auto;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 4px 8px 25px;
}

.sidebar-brand strong {
  display: block;
  font-size: 15px;
}

.sidebar-brand span {
  display: block;
  margin-top: 3px;
  color: #9aa5b6;
  font-size: 11px;
}

.sidebar nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  width: 100%;
  text-align: left;
  border: 0;
  color: #aeb7c7;
  background: transparent;
  padding: 11px 12px;
  border-radius: 9px;
  font-weight: 600;
  transition: background .15s, color .15s;
}

.nav-item:hover,
.nav-item.active {
  color: white;
  background: #1f2937;
}

.nav-section {
  color: #667085;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .12em;
  padding: 15px 12px 7px;
}

.sidebar-bottom {
  margin-top: auto;
  padding-top: 10px;
}

.role-box {
  border-top: 1px solid #263143;
  padding: 15px 10px;
  margin-bottom: 7px;
}

.role-box strong {
  display: block;
  font-size: 13px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-box span {
  color: #8994a6;
  font-size: 11px;
}

.logout-nav {
  color: #ff9c9c;
}

.logout-nav:hover {
  color: #ff6b6b;
  background: rgba(255,100,100,.08);
}

/* ── Main Content ── */
.main {
  margin-left: 250px;
  width: calc(100% - 250px);
  min-height: 100vh;
  padding: 28px;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 25px;
  gap: 16px;
}

.topbar h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -.04em;
}

.topbar p {
  margin: 6px 0 0;
  color: #687386;
}

.top-role {
  background: white;
  border: 1px solid #e5e9f0;
  border-radius: 20px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

/* Cart Button */
.cart-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.cart-count {
  background: #ef4444;
  color: white;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 7px;
  min-width: 20px;
  text-align: center;
}

/* ── Page Titles ── */
.page-title {
  margin: 10px 0 18px;
}

.page-title h2 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -.025em;
}

.page-title p {
  margin: 5px 0;
  color: #687386;
  font-size: 13px;
}

/* ── Stats Grid ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.stat-card {
  background: white;
  border: 1px solid #e5e9f0;
  border-radius: 15px;
  padding: 19px;
}

.stat-card span {
  display: block;
  color: #687386;
  font-size: 12px;
  font-weight: 700;
}

.stat-card strong {
  display: block;
  margin-top: 8px;
  font-size: 25px;
  letter-spacing: -.04em;
}

/* ── Content Grid ── */
.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 18px;
}

/* ── Panel ── */
.panel {
  background: white;
  border: 1px solid #e5e9f0;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 18px;
}

.panel-header {
  margin-bottom: 17px;
}

.panel-header h2 {
  margin: 0 0 4px;
  font-size: 17px;
}

.panel-header p {
  margin: 0;
  color: #687386;
  font-size: 12px;
}

.panel-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 17px;
}

.panel-header-row .panel-header {
  margin-bottom: 0;
}

/* ── Summary List ── */
.summary-list {
  display: flex;
  flex-direction: column;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #eef1f5;
  font-size: 13px;
}

.summary-row:last-child {
  border-bottom: 0;
}

/* ── Table ── */
.table-wrap {
  width: 100%;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}

th {
  text-align: left;
  color: #7b8494;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .07em;
  padding: 11px;
  border-bottom: 1px solid #e8ecf2;
  white-space: nowrap;
}

td {
  padding: 13px 11px;
  border-bottom: 1px solid #eef1f5;
  font-size: 13px;
  vertical-align: middle;
}

td strong {
  display: block;
}

td small {
  display: block;
  margin-top: 3px;
  color: #7b8494;
}

tr:last-child td {
  border-bottom: 0;
}

/* ── Badges ── */
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 20px;
  padding: 5px 9px;
  font-size: 10px;
  font-weight: 800;
  text-transform: capitalize;
  background: #eef2f7;
  color: #596579;
}

.badge.success { background: #eaf8ef; color: #16753d; }
.badge.warning { background: #fff7df; color: #9a6700; }
.badge.danger  { background: #fff0f0; color: #b42318; }
.badge.neutral { background: #eef2f7; color: #596579; }

/* ── Actions ── */
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

/* ── Permission Tags ── */
.permission-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.tag {
  padding: 4px 7px;
  border-radius: 6px;
  background: #eef3ff;
  color: #315bb5;
  font-size: 10px;
  text-transform: capitalize;
}

/* ── User Select Grid / Invite Cards ── */
.user-select-grid {
  display: grid;
  gap: 9px;
}

.user-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  border: 1px solid #e8ecf2;
  border-radius: 11px;
  padding: 13px;
}

.user-card strong {
  display: block;
}

.user-card span {
  display: block;
  color: #7b8494;
  font-size: 11px;
  margin-top: 3px;
}

.invite-card {
  flex-wrap: wrap;
}

.invite-form label:first-of-type {
  margin-top: 0;
}

/* ── Empty State ── */
.empty {
  padding: 28px 10px;
  text-align: center;
  color: #9aa5b6;
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  z-index: 100;
  inset: 0;
  background: rgba(15,23,42,.52);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.modal {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  background: white;
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 25px 80px rgba(0,0,0,.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 15px;
  margin-bottom: 18px;
}

.modal-header h2 {
  margin: 0 0 3px;
  font-size: 19px;
}

.modal-header p {
  margin: 0;
  color: #687386;
  font-size: 12px;
}

.icon-button {
  border: 0;
  background: #eef2f7;
  border-radius: 9px;
  width: 34px;
  height: 34px;
  font-size: 22px;
  color: #667085;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background .15s;
}

.icon-button:hover {
  background: #e2e8f0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

/* ── Permission List ── */
.permission-list {
  display: grid;
  gap: 8px;
}

.permission {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #e7ebf1;
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: background .15s;
}

.permission:hover {
  background: #f8fafc;
}

.permission input {
  width: auto;
  flex-shrink: 0;
}

/* ── Order Tracking Timeline ── */
.tracking-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tracking-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 4px 0 22px;
  position: relative;
}

.tracking-step::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 18px;
  bottom: -4px;
  width: 2px;
  background: #e5e9f0;
}

.tracking-step:last-child::before {
  display: none;
}

.tracking-step.done::before {
  background: #2563eb;
}

.tracking-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #d7dde6;
  margin-top: 4px;
  flex-shrink: 0;
}

.tracking-step.done .tracking-dot {
  background: #2563eb;
  box-shadow: 0 0 0 4px rgba(37,99,235,.15);
}

.tracking-step-body strong {
  display: block;
  font-size: 14px;
  color: #172033;
}

.tracking-step:not(.done) .tracking-step-body strong {
  color: #9aa5b6;
}

.tracking-step-body span {
  display: block;
  margin-top: 2px;
  color: #7b8494;
  font-size: 11px;
}

.tracking-courier {
  margin-top: 6px;
  padding: 13px;
  border-radius: 11px;
  background: #f4f7fb;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
}

/* ── Support ── */
.support-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.support-card {
  background: white;
  border: 1px solid #e5e9f0;
  border-radius: 14px;
  padding: 17px;
  color: #172033;
  transition: border-color .15s, box-shadow .15s;
}

.support-card:hover {
  border-color: #2563eb;
  box-shadow: 0 4px 20px rgba(37,99,235,.1);
}

.support-card strong {
  display: block;
  font-size: 14px;
}

.support-card span {
  display: block;
  color: #687386;
  font-size: 12px;
  margin-top: 5px;
}

/* ── Shop Card ── */
.shop-name {
  margin: 0 0 5px;
}

.shop-meta {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 12px 0;
  color: #687386;
  font-size: 13px;
}

.shop-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.shop-card {
  background: white;
  border: 1px solid #e5e9f0;
  border-radius: 15px;
  padding: 17px;
}

.shop-card strong {
  display: block;
  font-size: 15px;
  margin-bottom: 6px;
}

.shop-card p {
  color: #687386;
  font-size: 12px;
  line-height: 1.5;
  min-height: 38px;
  margin: 0 0 10px;
}

/* ── Marketplace ── */
.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 15px;
}

.market-product {
  background: white;
  border: 1px solid #e5e9f0;
  border-radius: 15px;
  overflow: hidden;
  transition: box-shadow .2s;
}

.market-product:hover {
  box-shadow: 0 8px 30px rgba(0,0,0,.08);
}

.market-product img,
.image-placeholder {
  width: 100%;
  height: 170px;
  object-fit: cover;
  display: block;
}

.image-placeholder {
  display: grid;
  place-items: center;
  background: #edf1f6;
  color: #8a94a6;
  font-weight: 800;
}

.market-product-body {
  padding: 15px;
}

.product-eyebrow {
  font-size: 9px;
  color: #2563eb;
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: .1em;
  display: block;
  margin-bottom: 4px;
}

.market-product h3 {
  margin: 0 0 6px;
  font-size: 16px;
}

.market-product p {
  color: #687386;
  font-size: 12px;
  line-height: 1.5;
  min-height: 36px;
  margin: 0 0 12px;
}

.product-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.product-bottom strong {
  font-size: 17px;
}

.section-gap {
  margin-top: 32px;
}

/* ── Checkout ── */
.checkout-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px;
  border-radius: 10px;
  background: #f4f7fb;
  margin-bottom: 12px;
}

.checkout-summary span {
  font-size: 20px;
  font-weight: 800;
  color: #2563eb;
}

.cart-items {
  margin: 0 0 12px;
}

.cart-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #eef1f5;
}

.cart-row:last-child {
  border-bottom: 0;
}

.cart-row strong {
  display: block;
  font-size: 13px;
}

.cart-row span {
  display: block;
  margin-top: 3px;
  color: #687386;
  font-size: 11px;
}

.cart-qty {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.cart-qty span {
  font-weight: 700;
  font-size: 14px;
  min-width: 24px;
  text-align: center;
}

/* ── Loader ── */
.loader {
  width: 30px;
  height: 30px;
  border: 3px solid #e6ebf2;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin .8s linear infinite;
  margin: 20px auto 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Responsive ── */
@media (max-width: 900px) {
  .sidebar { width: 210px; }
  .main { margin-left: 210px; width: calc(100% - 210px); }
}

@media (max-width: 700px) {
  .sidebar {
    position: static;
    width: 100%;
    min-height: auto;
  }

  .dashboard {
    display: block;
  }

  .sidebar nav {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }

  .sidebar-bottom {
    margin-top: 15px;
  }

  .main {
    margin-left: 0;
    width: 100%;
    padding: 18px;
  }

  .topbar {
    flex-direction: column;
    gap: 12px;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .panel-header-row {
    flex-direction: column;
  }

  .guest-topbar {
    padding: 12px 16px;
  }

  .guest-main {
    padding: 18px 16px 40px;
  }
}
`;

if (
  typeof document !== "undefined" &&
  !document.getElementById("localshop-app-css")
) {
  const style = document.createElement("style");
  style.id = "localshop-app-css";
  style.textContent = css;
  document.head.appendChild(style);
}

export default App;
