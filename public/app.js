/* eslint-disable max-lines */

let socket = null;
let currentUser = "";
let selectedUser = "";
let usersOnline = [];

const conversations = new Map(); // username -> message[]
const unreadCounts = new Map(); // username -> number
const activityLog = [];
const userDisplayNames = new Map(); // username -> displayName

const MAX_ACTIVITY_ITEMS = 30;
const TOAST_DURATION = 4200;
const THEME_STORAGE_KEY = "vaultchat-theme";
const CONVERSATIONS_STORAGE_KEY = "vaultchat-conversations";
const CRYPTO_KEYS_STORAGE_KEY = "vaultchat-crypto-keys";
const AUTH_TOKEN_KEY = "vaultchat-token";

// Helper functions
function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// DOM References
const authView = document.getElementById("authView");
const setupView = document.getElementById("setupView");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const setupForm = document.getElementById("setupForm");

const loginUsernameInput = document.getElementById("loginUsernameInput");
const loginPasswordInput = document.getElementById("loginPasswordInput");
const loginBtn = document.getElementById("loginBtn");
const loginStatusText = document.getElementById("loginStatusText");

const registerUsernameInput = document.getElementById("registerUsernameInput");
const registerPasswordInput = document.getElementById("registerPasswordInput");
const registerConfirmPasswordInput = document.getElementById(
  "registerConfirmPasswordInput"
);
const registerBtn = document.getElementById("registerBtn");
const registerStatusText = document.getElementById("registerStatusText");

const displayNameInput = document.getElementById("displayNameInput");
const setupBtn = document.getElementById("setupBtn");
const setupStatusText = document.getElementById("setupStatusText");

const showRegisterLink = document.getElementById("showRegisterLink");
const showLoginLink = document.getElementById("showLoginLink");

const chatView = document.getElementById("chatView");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserLabel = document.getElementById("currentUserLabel");
const currentUserAvatar = document.getElementById("currentUserAvatar");

const userFilterInput = document.getElementById("userFilterInput");
const userList = document.getElementById("userList");
const userListEmpty = document.getElementById("userListEmpty");
const onlineCountBadge = document.getElementById("onlineCountBadge");
const contactsList = document.getElementById("contactsList");
const recentContactsList = document.getElementById("recentContactsList");
const recentContactsEmpty = document.getElementById("recentContactsEmpty");

const chatWithName = document.getElementById("chatWithName");
const lastSeenLabel = document.getElementById("lastSeenLabel");
const conversationEmpty = document.getElementById("conversationEmpty");
const messagesContainer = document.getElementById("messagesContainer");
const typingStatus = document.getElementById("typingStatus");
const messageCountLabel = document.getElementById("messageCountLabel");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const connectionStatus = document.getElementById("connectionStatus");
const connectionDot = document.getElementById("connectionDot");
const changeDisplayNameBtn = document.getElementById("changeDisplayNameBtn");

const themeToggle = document.getElementById("themeToggle");

const toastContainer = document.getElementById("toastContainer");
const activityFeed = document.getElementById("activityFeed");

// Contacts list
const contacts = new Map(); // username -> contact info

let typingTimer = null;
let authToken = null;
let loggedInUser = null;

/***********************
 * Initialization
 ***********************/

(async function bootstrap() {
  setupTheme();
  bindUIEvents();

  // Kiểm tra token đã lưu
  authToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (authToken) {
    try {
      const response = await fetch("/api/verify", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        loggedInUser = data.user;
        // Nếu đã có display name, tự động đăng nhập vào chat
        if (data.user.displayName) {
          await autoLoginWithDisplayName(data.user.displayName);
          return;
        }
        // Chưa có display name, hiển thị setup view
        authView.classList.add("hidden");
        setupView.classList.remove("hidden");
        return;
      } else {
        // Token không hợp lệ
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch (error) {
      console.error("Lỗi verify token:", error);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }

  // Chưa đăng nhập, hiển thị auth view
  authView.classList.remove("hidden");
})();

function bindUIEvents() {
  // Đăng nhập form
  if (loginForm) {
    loginUsernameInput.addEventListener("input", refreshLoginButtonState);
    loginPasswordInput.addEventListener("input", refreshLoginButtonState);
    loginForm.addEventListener("submit", handleLoginSubmit);
  }

  // Đăng ký form
  if (registerForm) {
    registerUsernameInput.addEventListener("input", () => {
      registerUsernameInput.value = sanitizeUsername(
        registerUsernameInput.value
      );
      refreshRegisterButtonState();
    });
    registerPasswordInput.addEventListener("input", refreshRegisterButtonState);
    registerConfirmPasswordInput.addEventListener(
      "input",
      refreshRegisterButtonState
    );
    registerForm.addEventListener("submit", handleRegisterSubmit);
  }

  // Setup form
  if (setupForm) {
    displayNameInput.addEventListener("input", refreshSetupButtonState);
    setupForm.addEventListener("submit", handleSetupSubmit);
  }

  // Toggle giữa đăng nhập và đăng ký
  if (showRegisterLink) {
    showRegisterLink.addEventListener("click", (e) => {
      e.preventDefault();
      loginForm.classList.add("hidden");
      registerForm.classList.remove("hidden");
    });
  }

  if (showLoginLink) {
    showLoginLink.addEventListener("click", (e) => {
      e.preventDefault();
      registerForm.classList.add("hidden");
      loginForm.classList.remove("hidden");
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      location.reload();
    });
  }

  if (changeDisplayNameBtn) {
    changeDisplayNameBtn.addEventListener("click", () => {
      const newDisplayName = prompt(
        "Nhập tên hiển thị mới:",
        loggedInUser?.displayName || currentUserLabel.textContent
      );
      if (newDisplayName && newDisplayName.trim()) {
        updateDisplayName(newDisplayName.trim());
      }
    });
  }

  userFilterInput.addEventListener("input", () => renderUserList());

  sendBtn.addEventListener("click", () => sendMessage());
  messageInput.addEventListener("input", handleMessageInput);
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

/***********************
 * Theme
 ***********************/

function setupTheme() {
  if (!themeToggle) return;
  const preferred =
    localStorage.getItem(THEME_STORAGE_KEY) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");

  applyTheme(preferred);
  themeToggle.checked = preferred === "dark";

  themeToggle.addEventListener("change", () => {
    const theme = themeToggle.checked ? "dark" : "light";
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    pushActivity(`Chuyển sang giao diện ${theme === "dark" ? "tối" : "sáng"}.`);
  });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
}

/***********************
 * Authentication
 ***********************/

async function handleLoginSubmit(event) {
  event.preventDefault();
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;

  if (!username || !password) return;

  setLoginLoading(true, "Đang đăng nhập...");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Đăng nhập thất bại");
    }

    // Lưu token
    authToken = data.token;
    loggedInUser = data.user;
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);

    // Chuyển sang setup view
    authView.classList.add("hidden");
    setupView.classList.remove("hidden");
    setLoginLoading(false, "");
    showToast(
      "Đăng nhập thành công",
      "Vui lòng chọn tên hiển thị để bắt đầu.",
      "success"
    );
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
    setLoginLoading(false, error.message || "Đăng nhập thất bại");
    showToast(
      "Đăng nhập thất bại",
      error.message || "Vui lòng thử lại.",
      "error"
    );
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const username = registerUsernameInput.value.trim();
  const password = registerPasswordInput.value;
  const confirmPassword = registerConfirmPasswordInput.value;

  if (!username || !password || !confirmPassword) return;

  if (password !== confirmPassword) {
    registerStatusText.textContent = "Mật khẩu xác nhận không khớp";
    showToast("Lỗi", "Mật khẩu xác nhận không khớp", "error");
    return;
  }

  if (username.length < 3 || username.length > 20) {
    registerStatusText.textContent = "Tên đăng nhập phải từ 3-20 ký tự";
    showToast("Lỗi", "Tên đăng nhập phải từ 3-20 ký tự", "error");
    return;
  }

  if (password.length < 6) {
    registerStatusText.textContent = "Mật khẩu phải có ít nhất 6 ký tự";
    showToast("Lỗi", "Mật khẩu phải có ít nhất 6 ký tự", "error");
    return;
  }

  registerBtn.dataset.loading = "true";
  registerBtn.classList.add("loading");
  registerStatusText.textContent = "Đang đăng ký...";

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Đăng ký thất bại");
    }

    // Lưu token
    authToken = data.token;
    loggedInUser = data.user;
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);

    // Chuyển sang setup view
    authView.classList.add("hidden");
    setupView.classList.remove("hidden");
    registerBtn.dataset.loading = "false";
    registerBtn.classList.remove("loading");
    registerStatusText.textContent = "";
    showToast(
      "Đăng ký thành công",
      "Vui lòng chọn tên hiển thị để bắt đầu.",
      "success"
    );
  } catch (error) {
    console.error("Lỗi đăng ký:", error);
    registerBtn.dataset.loading = "false";
    registerBtn.classList.remove("loading");
    registerStatusText.textContent = error.message || "Đăng ký thất bại";
    showToast(
      "Đăng ký thất bại",
      error.message || "Vui lòng thử lại.",
      "error"
    );
  }
}

function setSetupLoading(isLoading, message = "") {
  if (!setupBtn) return;
  setupBtn.dataset.loading = isLoading ? "true" : "false";
  setupBtn.classList.toggle("loading", isLoading);
  if (setupStatusText) {
    setupStatusText.textContent = message;
  }
  refreshSetupButtonState();
}

async function handleSetupSubmit(event) {
  event.preventDefault();
  const displayName = displayNameInput.value.trim();
  if (!displayName) return;

  if (!loggedInUser) {
    showToast("Lỗi", "Chưa đăng nhập", "error");
    return;
  }

  setSetupLoading(true, "Đang thiết lập phiên bảo mật...");

  try {
    // Sử dụng username từ loggedInUser, displayName chỉ để hiển thị
    currentUser = loggedInUser.username;

    // Đảm bảo crypto đã sẵn sàng
    await cryptoUtils.ensureReady();

    let publicKey;
    try {
      publicKey = await cryptoUtils.getPublicKeyJWK();
    } catch (cryptoError) {
      console.error("Lỗi khi lấy khóa:", cryptoError);
      throw new Error("Không thể lấy khóa mã hóa. Vui lòng thử lại.");
    }

    updateIdentityUI(displayName || currentUser);

    // Tạo socket với timeout
    socket = io({
      timeout: 10000, // 10 giây timeout
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    setupSocketHandlers();

    socket.on("connect", () => {
      setConnectionState(true, "Đã kết nối");
      // Lưu display name lên server
      saveDisplayNameToServer(displayName)
        .then(() => {
          socket.emit("join", {
            username: currentUser,
            publicKey,
            displayName,
          });
        })
        .catch((err) => {
          console.error("Lỗi lưu display name:", err);
          socket.emit("join", {
            username: currentUser,
            publicKey,
            displayName,
          });
        });
      pushActivity("Đã kết nối tới máy chủ bảo mật.");
    });

    socket.on("disconnect", () => {
      setConnectionState(false, "Mất kết nối");
      pushActivity("Kết nối bị gián đoạn.");
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connect error", error);
      setConnectionState(false, "Không thể kết nối");
      showToast(
        "Kết nối thất bại",
        "Không thể kết nối đến máy chủ. Thử lại sau.",
        "error"
      );
    });

    setupView.classList.add("hidden");
    chatView.classList.remove("hidden");
    messageInput.focus();
    updateComposerState();

    // Tải danh bạ
    socket.emit("get:contacts", { username: currentUser });

    // Render user list và contacts
    try {
      renderUserList();
      renderRecentContacts();
    } catch (renderError) {
      console.warn("Lỗi khi render user list:", renderError);
    }

    pushActivity(
      `Đăng nhập thành công dưới tên ${displayName || currentUser}.`
    );
    setSetupLoading(false, "Đã kết nối.");
  } catch (error) {
    console.error("Setup error", error);
    setSetupLoading(false, "Không thể khởi tạo kết nối. Vui lòng thử lại.");
    const errorMessage = error.message || "Không thể thiết lập phiên bảo mật.";
    showToast("Thiết lập thất bại", errorMessage, "error");
  }
}

function setConnectionState(isConnected, label) {
  connectionStatus.textContent = label;
  connectionStatus.classList.toggle("connected", isConnected);
  connectionStatus.classList.toggle("disconnected", !isConnected);
  if (connectionDot) {
    connectionDot.style.background = isConnected ? "#34d399" : "#f87171";
  }
}

function updateIdentityUI(username) {
  currentUserLabel.textContent = username;
  currentUserAvatar.textContent = username.charAt(0).toUpperCase();
}

// Tự động đăng nhập với display name đã lưu
async function autoLoginWithDisplayName(displayName) {
  if (!loggedInUser) return;

  currentUser = loggedInUser.username;

  // Đảm bảo crypto đã sẵn sàng
  await cryptoUtils.ensureReady();

  let publicKey;
  try {
    publicKey = await cryptoUtils.getPublicKeyJWK();
  } catch (cryptoError) {
    console.error("Lỗi khi lấy khóa:", cryptoError);
    // Nếu lỗi, vẫn hiển thị setup view
    authView.classList.add("hidden");
    setupView.classList.remove("hidden");
    return;
  }

  updateIdentityUI(displayName || currentUser);

  // Tạo socket với timeout
  socket = io({
    timeout: 10000,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  setupSocketHandlers();

  socket.on("connect", () => {
    setConnectionState(true, "Đã kết nối");
    socket.emit("join", { username: currentUser, publicKey, displayName });
    pushActivity("Đã kết nối tới máy chủ bảo mật.");
  });

  socket.on("disconnect", () => {
    setConnectionState(false, "Mất kết nối");
    pushActivity("Kết nối bị gián đoạn.");
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connect error", error);
    setConnectionState(false, "Không thể kết nối");
    showToast(
      "Kết nối thất bại",
      "Không thể kết nối đến máy chủ. Thử lại sau.",
      "error"
    );
  });

  // Ẩn setup view, hiển thị chat view
  setupView.classList.add("hidden");
  authView.classList.add("hidden");
  chatView.classList.remove("hidden");
  messageInput.focus();
  updateComposerState();

  // Tải danh bạ
  socket.emit("get:contacts", { username: currentUser });

  // Render user list và contacts
  try {
    renderUserList();
    renderRecentContacts();
  } catch (renderError) {
    console.warn("Lỗi khi render user list:", renderError);
  }

  pushActivity(`Đăng nhập thành công dưới tên ${displayName || currentUser}.`);
}

// Thiết lập socket handlers (tách ra để tái sử dụng)
function setupSocketHandlers() {
  socket.on("users", async (payload) => {
    const changes = await syncPublicKeys(payload);
    usersOnline = payload;
    // Lưu display names
    payload.forEach((user) => {
      if (user.displayName) {
        userDisplayNames.set(user.username, user.displayName);
      }
    });
    renderUserList();
    updateOnlineCount();
    updatePresenceMeta();
    handleKeyChanges(changes);
    // Cập nhật chat header nếu đang có user được chọn
    if (selectedUser) {
      updateChatHeader(selectedUser);
    }
    // Cập nhật danh sách liên hệ
    renderRecentContacts();
  });

  socket.on("dm", handleIncomingMessage);
  socket.on("dm:ack", handleMessageAck);

  // Lấy lịch sử từ server
  socket.on("history", async ({ conversationId, messages }) => {
    if (!selectedUser) return;
    const conversation = getConversation(selectedUser);
    // Chỉ thêm tin nhắn chưa có
    for (const msg of messages) {
      if (!conversation.find((m) => m.id === msg.messageId)) {
        // Xử lý giải mã tin nhắn
        await handleHistoryMessage(msg, conversation);
      }
    }
    // Cập nhật danh sách liên hệ sau khi load history
    renderRecentContacts();
  });

  // Nhận danh bạ
  socket.on("contacts", ({ contacts: contactsData }) => {
    contacts.clear();
    contactsData.forEach((contact) => {
      contacts.set(contact.contactUsername, contact);
    });
    renderContactsList();
  });

  socket.on("contact:added", ({ contact }) => {
    contacts.set(contact.contactUsername, contact);
    renderContactsList();
  });

  socket.on("typing", ({ from }) => {
    if (from === selectedUser)
      typingStatus.textContent = `${from} đang nhập...`;
  });

  socket.on("stopTyping", ({ from }) => {
    if (from === selectedUser) typingStatus.textContent = "";
  });
}

// Xử lý tin nhắn từ lịch sử (hỗ trợ cả sent và received)
async function handleHistoryMessage(msg, conversation) {
  const isInbound = msg.from.toLowerCase() !== currentUser.toLowerCase();

  // Nếu là tin nhắn gửi đi, thử lấy plaintext từ local storage
  if (!isInbound) {
    const localPlaintext = getLocalMessagePlaintext(msg.messageId);
    if (localPlaintext) {
      const message = {
        id: msg.messageId,
        author: msg.from,
        text: localPlaintext,
        timestamp: new Date(msg.timestamp).getTime(),
        inbound: false,
        status: msg.status || "delivered",
      };
      conversation.push(message);
      conversation.sort((a, b) => a.timestamp - b.timestamp);
      if (selectedUser === getActiveConversation()) {
        renderConversation(selectedUser);
      }
      return;
    }
  }

  // Nếu là tin nhắn nhận hoặc không tìm thấy plaintext local, giải mã
  try {
    const text = await cryptoUtils.decryptMessage(msg.encryptedMessage);
    const message = {
      id: msg.messageId,
      author: msg.from,
      text,
      timestamp: new Date(msg.timestamp).getTime(),
      inbound: isInbound,
      status: msg.status || "delivered",
    };
    conversation.push(message);
    conversation.sort((a, b) => a.timestamp - b.timestamp);
    if (selectedUser === getActiveConversation()) {
      renderConversation(selectedUser);
    }
  } catch (err) {
    console.error("Lỗi giải mã tin nhắn lịch sử:", err);
  }
}

// Lưu plaintext của tin nhắn đã gửi vào local storage
const SENT_MESSAGES_STORAGE_KEY = "vaultchat-sent-messages";

function saveSentMessagePlaintext(messageId, plaintext) {
  try {
    const stored = localStorage.getItem(SENT_MESSAGES_STORAGE_KEY);
    const sentMessages = stored ? JSON.parse(stored) : {};
    sentMessages[messageId] = plaintext;
    localStorage.setItem(
      SENT_MESSAGES_STORAGE_KEY,
      JSON.stringify(sentMessages)
    );
  } catch (error) {
    console.error("Lỗi lưu plaintext tin nhắn:", error);
  }
}

function getLocalMessagePlaintext(messageId) {
  try {
    const stored = localStorage.getItem(SENT_MESSAGES_STORAGE_KEY);
    if (!stored) return null;
    const sentMessages = JSON.parse(stored);
    return sentMessages[messageId] || null;
  } catch (error) {
    console.error("Lỗi đọc plaintext tin nhắn:", error);
    return null;
  }
}

function setLoginLoading(isLoading, message = "") {
  loginBtn.dataset.loading = isLoading ? "true" : "false";
  loginBtn.classList.toggle("loading", isLoading);
  loginStatusText.textContent = message;
  refreshLoginButtonState();
}

function refreshLoginButtonState() {
  if (!loginBtn) return;
  const isLoading = loginBtn.dataset.loading === "true";
  const hasUsername = Boolean(loginUsernameInput.value.trim());
  const hasPassword = Boolean(loginPasswordInput.value.trim());
  loginBtn.disabled = isLoading || !hasUsername || !hasPassword;
}

function refreshRegisterButtonState() {
  if (!registerBtn) return;
  const isLoading = registerBtn.dataset.loading === "true";
  const hasUsername = Boolean(registerUsernameInput.value.trim());
  const hasPassword = Boolean(registerPasswordInput.value.trim());
  const hasConfirmPassword = Boolean(registerConfirmPasswordInput.value.trim());
  const passwordsMatch =
    registerPasswordInput.value === registerConfirmPasswordInput.value;
  registerBtn.disabled =
    isLoading ||
    !hasUsername ||
    !hasPassword ||
    !hasConfirmPassword ||
    !passwordsMatch;
}

function refreshSetupButtonState() {
  if (!setupBtn) return;
  const isLoading = setupBtn.dataset.loading === "true";
  const hasDisplayName = Boolean(displayNameInput.value.trim());
  setupBtn.disabled = isLoading || !hasDisplayName;
}

/***********************
 * User Directory
 ***********************/

async function syncPublicKeys(users) {
  try {
    return await cryptoUtils.syncPublicKeys(users, currentUser);
  } catch (error) {
    console.error("Sync key error", error);
    showToast("Cảnh báo bảo mật", "Không thể đồng bộ khóa công khai.", "error");
    return { added: [], changed: [] };
  }
}

// Lấy khóa công khai của user offline từ server
async function fetchPublicKeyForUser(username) {
  try {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Chưa đăng nhập");
    }

    const response = await fetch(
      `/api/user/${encodeURIComponent(username)}/public-key`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("User hoặc khóa công khai không tồn tại");
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Đồng bộ khóa vào cryptoUtils
    await cryptoUtils.syncPublicKeys(
      [
        {
          username: data.username,
          publicKey: data.publicKey,
        },
      ],
      currentUser
    );

    return true;
  } catch (error) {
    console.error(`Lỗi lấy khóa công khai cho ${username}:`, error);
    return false;
  }
}

function renderUserList() {
  userList.innerHTML = "";
  const filter = userFilterInput.value.trim().toLowerCase();

  // Chỉ hiển thị users đang online
  const onlineUsernames = usersOnline
    .map((entry) => entry.username)
    .filter((username) => username && username !== currentUser);

  const filtered = onlineUsernames.filter((username) => {
    const displayName = userDisplayNames.get(username) || "";
    return (
      username.toLowerCase().includes(filter) ||
      displayName.toLowerCase().includes(filter)
    );
  });

  userListEmpty.classList.toggle("hidden", filtered.length > 0);

  filtered
    .sort((a, b) => {
      const unreadA = unreadCounts.get(a) || 0;
      const unreadB = unreadCounts.get(b) || 0;
      if (unreadA !== unreadB) return unreadB - unreadA;
      return a.localeCompare(b);
    })
    .forEach((username) => {
      const contactEl = buildContactItem(username, true);
      userList.appendChild(contactEl);
    });

  refreshSelectionHighlight();
  // Cập nhật danh sách liên hệ
  renderRecentContacts();
}

function buildContactItem(username, isOnlineList = false) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "contact-item";
  item.dataset.username = username;

  const top = document.createElement("div");
  top.className = "contact-top";

  const userBlock = document.createElement("div");
  userBlock.className = "contact-user";

  const initial = document.createElement("span");
  initial.className = "contact-initial";
  const displayName = userDisplayNames.get(username);
  initial.textContent = (displayName || username).charAt(0).toUpperCase();

  // Tạo container cho tên
  const nameContainer = document.createElement("div");
  nameContainer.className = "contact-name-container";

  // Hiển thị display name (nếu có) hoặc username làm tên chính
  const name = document.createElement("span");
  name.className = "contact-name";
  name.textContent = displayName || username;

  // Hiển thị username bên dưới nếu có display name
  if (displayName) {
    const usernameSpan = document.createElement("span");
    usernameSpan.className = "contact-username-small";
    usernameSpan.textContent = `@${username}`;
    nameContainer.append(name, usernameSpan);
  } else {
    nameContainer.appendChild(name);
  }

  userBlock.append(initial, nameContainer);

  const meta = document.createElement("div");
  meta.className = "contact-meta";
  const isOnline = usersOnline.some((user) => user.username === username);
  if (isOnline) {
    meta.textContent = "🟢 Đang online";
  } else {
    meta.textContent = conversations.has(username)
      ? "📜 Có lịch sử"
      : "⚫ Ngoại tuyến";
  }

  top.append(userBlock, meta);

  // Chỉ hiển thị preview cho danh sách liên hệ, không hiển thị cho danh sách online
  if (!isOnlineList) {
    const preview = document.createElement("div");
    preview.className = "contact-preview";
    const lastMessageText = getLastMessagePreview(username);
    const previewText = document.createElement("span");
    previewText.textContent = lastMessageText;

    preview.appendChild(previewText);

    const unread = unreadCounts.get(username) || 0;
    if (unread > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = unread > 9 ? "9+" : unread.toString();
      preview.appendChild(badge);
      item.classList.add("unread");
    } else {
      item.classList.remove("unread");
    }

    item.append(top, preview);
  } else {
    item.appendChild(top);
  }

  item.addEventListener("click", () => selectUser(username));

  return item;
}

function refreshSelectionHighlight() {
  userList.querySelectorAll(".contact-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.username === selectedUser);
  });
  if (recentContactsList) {
    recentContactsList.querySelectorAll(".contact-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.username === selectedUser);
    });
  }
}

// Render danh sách liên hệ (người đã nhắn tin)
async function renderRecentContacts() {
  if (!recentContactsList) return;

  recentContactsList.innerHTML = "";

  // Lấy danh sách users từ conversations (người đã nhắn tin)
  const contactUsernames = Array.from(conversations.keys()).filter(
    (username) => username && username !== currentUser
  );

  // Loại bỏ những người đang online (vì họ đã có trong danh sách online)
  const onlineUsernames = usersOnline.map((u) => u.username);
  const offlineContacts = contactUsernames.filter(
    (username) => !onlineUsernames.includes(username)
  );

  if (offlineContacts.length === 0) {
    recentContactsEmpty.classList.remove("hidden");
    return;
  }

  recentContactsEmpty.classList.add("hidden");

  // Fetch display names cho các contacts chưa có
  if (authToken) {
    const fetchPromises = offlineContacts
      .filter((username) => !userDisplayNames.has(username))
      .map(async (username) => {
        try {
          const response = await fetch(
            `/api/user/${encodeURIComponent(username)}/display-name`,
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
              },
            }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.displayName) {
              userDisplayNames.set(username, data.displayName);
            }
          }
        } catch (error) {
          console.error("Lỗi lấy display name:", error);
        }
      });
    await Promise.all(fetchPromises);
  }

  // Sắp xếp theo thời gian tin nhắn cuối
  offlineContacts
    .sort((a, b) => {
      const convA = conversations.get(a) || [];
      const convB = conversations.get(b) || [];
      const lastMsgA = convA.length > 0 ? convA[convA.length - 1].timestamp : 0;
      const lastMsgB = convB.length > 0 ? convB[convB.length - 1].timestamp : 0;
      return lastMsgB - lastMsgA;
    })
    .forEach((username) => {
      const contactEl = buildContactItem(username, false);
      recentContactsList.appendChild(contactEl);
    });

  refreshSelectionHighlight();
}

function updateOnlineCount() {
  const count = usersOnline.filter(
    (user) => user.username !== currentUser
  ).length;
  onlineCountBadge.textContent = count.toString();
}

/***********************
 * Conversation Handling
 ***********************/

function selectUser(username) {
  selectedUser = username;
  clearUnread(username);
  refreshSelectionHighlight();

  updateChatHeader(username);
  typingStatus.textContent = "";
  conversationEmpty.classList.add("hidden");

  // Tải lịch sử từ server ngay khi click
  if (socket && socket.connected) {
    socket.emit("get:history", {
      username: currentUser,
      withUser: username,
      limit: 100,
    });
  }

  // Render conversation hiện tại trước (có thể rỗng)
  renderConversation(username);
  updatePresenceMeta();
  updateComposerState();
  showConversationToast(username);
}

// Cập nhật chat header với display name và username
async function updateChatHeader(username) {
  let displayName = userDisplayNames.get(username) || null;

  // Nếu chưa có display name, thử lấy từ server
  if (!displayName && authToken) {
    try {
      const response = await fetch(
        `/api/user/${encodeURIComponent(username)}/display-name`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.displayName) {
          displayName = data.displayName;
          userDisplayNames.set(username, displayName);
        }
      }
    } catch (error) {
      console.error("Lỗi lấy display name:", error);
    }
  }

  // Xóa nội dung cũ
  chatWithName.innerHTML = "";

  if (displayName) {
    // Hiển thị display name làm text chính
    const nameSpan = document.createElement("span");
    nameSpan.textContent = displayName;
    nameSpan.className = "chat-display-name";

    // Hiển thị username bên cạnh với font nhỏ hơn và mờ hơn
    const usernameSpan = document.createElement("span");
    usernameSpan.textContent = `@${username}`;
    usernameSpan.className = "chat-username";

    chatWithName.appendChild(nameSpan);
    chatWithName.appendChild(usernameSpan);
  } else {
    // Nếu chưa có display name, chỉ hiển thị username
    chatWithName.textContent = `@${username}`;
  }
}

function renderConversation(username) {
  messagesContainer.innerHTML = "";
  const conversation = getConversation(username);
  conversation.forEach((message) => renderMessageBubble(message));
  scrollMessagesToBottom();
  updateMessageMetrics(conversation.length);
  toggleEmptyState();
}

function getConversation(username) {
  if (!conversations.has(username)) {
    conversations.set(username, []);
  }
  return conversations.get(username);
}

function addMessageToConversation(username, message) {
  const conversation = getConversation(username);
  conversation.push(message);
  conversation.sort((a, b) => a.timestamp - b.timestamp);
  updateMessageMetrics(conversation.length);
  updateContactPreview(username);
  // Cập nhật danh sách liên hệ khi có tin nhắn mới
  renderRecentContacts();
  // Không cần lưu vào localStorage nữa vì đã lưu vào MongoDB
}

function renderMessageBubble(message) {
  let bubble = messagesContainer.querySelector(`[data-msg-id="${message.id}"]`);
  if (!bubble) {
    bubble = document.createElement("article");
    bubble.className = `message ${message.inbound ? "inbound" : "outbound"}`;
    bubble.dataset.msgId = message.id;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.dataset.role = "meta";
    meta.appendChild(createMetaSpan(message.inbound ? message.author : "Bạn"));
    meta.appendChild(createMetaSpan(formatTime(message.timestamp)));

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message.text;

    bubble.append(meta, content);

    if (!message.inbound) {
      const status = document.createElement("div");
      status.className = `message-status ${message.status}`;
      status.dataset.role = "status";
      status.textContent = statusLabel(message.status);
      bubble.appendChild(status);
    }

    messagesContainer.appendChild(bubble);
  } else {
    updateMessageStatusBubble(bubble, message.status);
  }

  toggleEmptyState();
}

function updateMessageStatusBubble(bubble, status) {
  const statusEl = bubble.querySelector('[data-role="status"]');
  if (!statusEl) {
    // Nếu chưa có status element, tạo mới
    if (!bubble.classList.contains("inbound")) {
      const statusDiv = document.createElement("div");
      statusDiv.className = `message-status ${status}`;
      statusDiv.dataset.role = "status";
      statusDiv.textContent = statusLabel(status);
      bubble.appendChild(statusDiv);
    }
    return;
  }
  statusEl.className = `message-status ${status}`;
  statusEl.textContent = statusLabel(status);
}

function statusLabel(status) {
  switch (status) {
    case "pending":
      return "Đang gửi...";
    case "delivered":
      return "Đã chuyển";
    case "error":
      return "Gửi thất bại";
    default:
      return "";
  }
}

// Lưu display name lên server
async function saveDisplayNameToServer(displayName) {
  if (!authToken || !displayName) return;
  try {
    const response = await fetch("/api/display-name", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ displayName }),
    });
    if (response.ok) {
      const data = await response.json();
      loggedInUser = data.user;
    }
  } catch (error) {
    console.error("Lỗi lưu display name:", error);
  }
}

// Cập nhật display name
async function updateDisplayName(newDisplayName) {
  if (!newDisplayName || !newDisplayName.trim()) {
    showToast("Lỗi", "Tên hiển thị không được để trống", "error");
    return;
  }

  try {
    await saveDisplayNameToServer(newDisplayName);
    updateIdentityUI(newDisplayName);
    if (socket && socket.connected) {
      socket.emit("join", {
        username: currentUser,
        publicKey: await cryptoUtils.getPublicKeyJWK(),
        displayName: newDisplayName,
      });
    }
    showToast("Thành công", "Đã cập nhật tên hiển thị", "success");
  } catch (error) {
    console.error("Lỗi cập nhật display name:", error);
    showToast("Lỗi", "Không thể cập nhật tên hiển thị", "error");
  }
}

function createMetaSpan(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function toggleEmptyState() {
  if (!selectedUser) {
    conversationEmpty.classList.remove("hidden");
    conversationEmpty.textContent =
      "Hãy chọn một người dùng bên trái để bắt đầu cuộc trò chuyện riêng tư. Khóa sẽ được trao đổi tự động.";
    return;
  }

  const conversation = getConversation(selectedUser);
  conversationEmpty.classList.toggle("hidden", conversation.length > 0);
  if (conversation.length === 0) {
    conversationEmpty.textContent =
      "Chưa có tin nhắn nào trong cuộc trò chuyện này.";
  }
}

function scrollMessagesToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateMessageMetrics(count) {
  messageCountLabel.textContent = `${count} tin nhắn`;
}

function updateContactPreview(username) {
  const contactEl = userList.querySelector(`[data-username="${username}"]`);
  if (!contactEl) return;
  const previewEl = contactEl.querySelector(".contact-preview span");
  if (previewEl) {
    previewEl.textContent = getLastMessagePreview(username);
  }
}

function getLastMessagePreview(username) {
  const conversation = getConversation(username);
  if (!conversation.length) return "Chưa có tin nhắn.";
  const last = conversation[conversation.length - 1];
  const prefix = last.inbound ? `${last.author}: ` : "Bạn: ";
  return prefix + truncate(last.text, 60);
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}

function updatePresenceMeta() {
  if (!selectedUser) {
    lastSeenLabel.textContent = "";
    return;
  }
  const isOnline = usersOnline.some((user) => user.username === selectedUser);
  lastSeenLabel.textContent = isOnline ? "Đang hoạt động" : "Ngoại tuyến";
}

/***********************
 * Messaging
 ***********************/

async function sendMessage() {
  if (!selectedUser) {
    showToast(
      "Chưa chọn người nhận",
      "Vui lòng chọn một người dùng trước khi gửi.",
      "warning"
    );
    return;
  }

  const text = messageInput.value.trim();
  if (!text) return;
  if (!socket || !socket.connected) {
    showToast("Mất kết nối", "Không thể gửi khi chưa kết nối.", "error");
    return;
  }

  // Kiểm tra khóa công khai, nếu chưa có thì tự động lấy từ server
  if (!cryptoUtils.hasPublicKey(selectedUser)) {
    showToast("Thông tin", "Đang lấy khóa công khai...", "info");
    const success = await fetchPublicKeyForUser(selectedUser);
    if (!success) {
      showToast(
        "Lỗi bảo mật",
        "Không thể lấy khóa công khai của đối tác. Người dùng có thể chưa từng đăng nhập.",
        "error"
      );
      return;
    }
  }

  const messageId = generateMessageId();
  const now = Date.now();
  const outboundMessage = {
    id: messageId,
    author: currentUser,
    text,
    timestamp: now,
    inbound: false,
    status: "pending",
  };

  // Lưu plaintext vào local storage để có thể đọc lại sau
  saveSentMessagePlaintext(messageId, text);

  addMessageToConversation(selectedUser, outboundMessage);
  if (selectedUser === getActiveConversation()) {
    renderMessageBubble(outboundMessage);
    scrollMessagesToBottom();
  }

  try {
    const encryptedMessage = await cryptoUtils.encryptMessage(
      text,
      selectedUser
    );
    socket.emit("dm", {
      messageId,
      from: currentUser,
      to: selectedUser,
      encryptedMessage,
      timestamp: now,
    });
    pushActivity(`Bạn đã gửi tin nhắn cho ${selectedUser}.`);
  } catch (error) {
    console.error("Encrypt error", error);
    outboundMessage.status = "error";
    renderMessageBubble(outboundMessage);
    showToast("Lỗi mã hóa", "Không thể mã hóa tin nhắn. Thử lại.", "error");
  }

  messageInput.value = "";
  autoResize(messageInput);
  updateComposerState();
  emitStopTyping();
}

function handleIncomingMessage({
  from,
  encryptedMessage,
  timestamp,
  messageId,
}) {
  cryptoUtils
    .decryptMessage(encryptedMessage)
    .then((text) => {
      const message = {
        id: messageId || generateMessageId(),
        author: from,
        text,
        timestamp,
        inbound: true,
        status: "delivered",
      };

      addMessageToConversation(from, message);

      if (selectedUser === from) {
        renderMessageBubble(message);
        scrollMessagesToBottom();
        typingStatus.textContent = "";
      } else {
        incrementUnread(from);
        showToast("Tin nhắn mới", `Bạn có tin nhắn mới từ ${from}.`, "info");
      }

      pushActivity(`Nhận tin nhắn mã hóa từ ${from}.`);
    })
    .catch((error) => {
      console.error("Decrypt error", error);
      showToast(
        "Không thể giải mã",
        `Tin nhắn từ ${from} không thể giải mã. Có thể khóa đã thay đổi.`,
        "error",
        6000
      );
    });
}

function handleMessageAck({ messageId, to }) {
  const conversation = getConversation(to);
  const message = conversation.find((entry) => entry.id === messageId);
  if (!message) return;
  message.status = "delivered";
  if (selectedUser === to) {
    const bubble = messagesContainer.querySelector(
      `[data-msg-id="${message.id}"]`
    );
    if (bubble) updateMessageStatusBubble(bubble, message.status);
  }
}

function getActiveConversation() {
  return selectedUser;
}

/***********************
 * Typing
 ***********************/

function handleMessageInput() {
  autoResize(messageInput);
  updateComposerState();
  emitTyping();
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
}

function emitTyping() {
  if (!socket || !socket.connected || !selectedUser) return;

  socket.emit("typing", { from: currentUser, to: selectedUser });

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => emitStopTyping(), 1000);
}

function emitStopTyping() {
  if (!socket || !socket.connected || !selectedUser) return;
  socket.emit("stopTyping", { from: currentUser, to: selectedUser });
}

function updateComposerState() {
  const hasText = Boolean(messageInput.value.trim());
  const canSend =
    hasText && Boolean(selectedUser) && socket && socket.connected;
  sendBtn.disabled = !canSend;
  messageInput.placeholder = selectedUser
    ? "Nhập tin nhắn bảo mật..."
    : "Chọn người dùng để bắt đầu nhắn tin...";
}

/***********************
 * Unread + Activity
 ***********************/

function incrementUnread(username) {
  unreadCounts.set(username, (unreadCounts.get(username) || 0) + 1);
  renderUserList();
}

function clearUnread(username) {
  unreadCounts.delete(username);
  renderUserList();
}

function pushActivity(text) {
  activityLog.unshift({ text, timestamp: Date.now() });
  if (activityLog.length > MAX_ACTIVITY_ITEMS) activityLog.pop();
  renderActivityFeed();
}

function renderActivityFeed() {
  activityFeed.innerHTML = "";

  if (!activityLog.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "activity-placeholder";
    placeholder.textContent = "Chưa có hoạt động.";
    activityFeed.appendChild(placeholder);
    return;
  }

  activityLog.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "activity-entry";

    const time = document.createElement("time");
    time.textContent = formatLongTime(entry.timestamp);
    item.appendChild(time);

    const desc = document.createElement("p");
    desc.textContent = entry.text;
    desc.style.margin = "0";
    desc.style.fontSize = "13px";
    item.appendChild(desc);

    activityFeed.appendChild(item);
  });
}

function showConversationToast(username) {
  showToast(
    "Đang trò chuyện",
    `Kết nối bảo mật với ${username} đã sẵn sàng.`,
    "success",
    3000
  );
}

/***********************
 * Toast & Modal
 ***********************/

function showToast(title, message, variant = "info", timeout = TOAST_DURATION) {
  const toast = document.createElement("div");
  toast.className = `toast ${variant}`;

  const heading = document.createElement("h4");
  heading.className = "toast-title";
  heading.textContent = title;

  const body = document.createElement("p");
  body.className = "toast-body";
  body.textContent = message;

  toast.append(heading, body);
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
    setTimeout(() => toast.remove(), 220);
  }, timeout);
}

// Render danh bạ
function renderContactsList() {
  if (!contactsList) return;

  contactsList.innerHTML = "";

  if (contacts.size === 0) {
    const placeholder = document.createElement("p");
    placeholder.className = "activity-placeholder";
    placeholder.textContent = "Chưa có danh bạ.";
    contactsList.appendChild(placeholder);
    return;
  }

  Array.from(contacts.entries())
    .sort((a, b) => {
      const timeA = a[1].lastContacted
        ? new Date(a[1].lastContacted).getTime()
        : 0;
      const timeB = b[1].lastContacted
        ? new Date(b[1].lastContacted).getTime()
        : 0;
      return timeB - timeA;
    })
    .forEach(([username, contact]) => {
      const item = document.createElement("div");
      item.className = "contact-item-small";
      item.style.cursor = "pointer";
      item.style.padding = "8px";
      item.style.borderRadius = "8px";
      item.style.marginBottom = "4px";

      const name = document.createElement("span");
      name.textContent = contact.nickname || username;
      name.style.fontWeight = "500";

      const meta = document.createElement("span");
      meta.textContent = username;
      meta.style.fontSize = "12px";
      meta.style.opacity = "0.6";
      meta.style.marginLeft = "8px";

      item.appendChild(name);
      item.appendChild(meta);

      item.addEventListener("click", () => {
        if (socket && socket.connected) {
          selectUser(username);
        }
      });

      contactsList.appendChild(item);
    });
}

/***********************
 * Storage Persistence
 ***********************/

function saveConversationsToStorage() {
  try {
    const conversationsData = {};
    conversations.forEach((messages, username) => {
      conversationsData[username] = messages;
    });
    localStorage.setItem(
      CONVERSATIONS_STORAGE_KEY,
      JSON.stringify(conversationsData)
    );
  } catch (error) {
    console.error("Lỗi lưu lịch sử trò chuyện:", error);
  }
}

function loadConversationsFromStorage() {
  try {
    const stored = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    if (!stored) return;

    const conversationsData = JSON.parse(stored);
    let totalMessages = 0;
    Object.entries(conversationsData).forEach(([username, messages]) => {
      if (Array.isArray(messages) && messages.length > 0) {
        conversations.set(username, messages);
        totalMessages += messages.length;
      }
    });

    // Cập nhật số lượng tin nhắn tổng nếu có conversation đang được chọn
    if (selectedUser && conversations.has(selectedUser)) {
      const conversation = conversations.get(selectedUser);
      updateMessageMetrics(conversation.length);
      renderConversation(selectedUser);
    }
  } catch (error) {
    console.error("Lỗi tải lịch sử trò chuyện:", error);
    // Xóa dữ liệu lỗi
    localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
  }
}

function clearConversationsStorage() {
  try {
    localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
  } catch (error) {
    console.error("Lỗi xóa lịch sử trò chuyện:", error);
  }
}

/***********************
 * Helpers
 ***********************/

function handleKeyChanges(changes) {
  changes.added.forEach((username) => {
    pushActivity(`Đã nhận khóa công khai của ${username}.`);
  });
  changes.changed.forEach((username) => {
    pushActivity(`Khóa của ${username} đã thay đổi.`);
  });
}

function generateMessageId() {
  if (window.crypto && window.crypto.randomUUID)
    return window.crypto.randomUUID();
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeUsername(value) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "");
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLongTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

/***********************
 * End of file
 ***********************/
