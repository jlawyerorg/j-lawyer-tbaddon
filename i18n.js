function i18nMessage(key, substitutions) {
  const message = browser.i18n.getMessage(key, substitutions);
  return message || key;
}

function applyI18n(root = document) {
  if (!root || !root.querySelectorAll) {
    return;
  }

  const language =
    browser.i18n.getMessage("localeCode") || browser.i18n.getUILanguage();
  if (document.documentElement && language) {
    document.documentElement.lang = language.split("-")[0];
  }

  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = i18nMessage(element.dataset.i18n);
  });

  root.querySelectorAll("[data-i18n-value]").forEach((element) => {
    element.value = i18nMessage(element.dataset.i18nValue);
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = i18nMessage(element.dataset.i18nPlaceholder);
  });

  root.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.title = i18nMessage(element.dataset.i18nTitle);
  });

  root.querySelectorAll("[data-i18n-label]").forEach((element) => {
    element.label = i18nMessage(element.dataset.i18nLabel);
  });
}

function getPermissionOriginsForServer(serverAddress) {
  if (!serverAddress) {
    return [];
  }

  try {
    const parsedUrl = new URL(serverAddress.trim());
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      return [`${parsedUrl.protocol}//*/*`];
    }
    return [];
  } catch (error) {
    console.warn("Invalid server address for permission check:", error);
    return [];
  }
}

async function hasServerPermission(serverAddress) {
  const origins = getPermissionOriginsForServer(serverAddress);
  if (origins.length === 0) {
    return true;
  }

  return browser.permissions.contains({ origins });
}

async function ensureStoredServerPermission(feedbackElement) {
  const { serverAddress } = await browser.storage.local.get("serverAddress");
  const hasPermission = await hasServerPermission(serverAddress);

  if (!hasPermission && feedbackElement) {
    feedbackElement.textContent = i18nMessage("serverPermissionMissingFeedback");
    feedbackElement.style.color = "orange";
  }

  return hasPermission;
}

function getSafeMessageTagKey(tagName) {
  return tagName.toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "tag";
}

function hasCurrentMessageTagsApi() {
  return (
    browser.messages.tags &&
    typeof browser.messages.tags.list === "function" &&
    typeof browser.messages.tags.create === "function"
  );
}

function hasLegacyMessageTagsApi() {
  return (
    typeof browser.messages.listTags === "function" &&
    typeof browser.messages.createTag === "function"
  );
}

async function listThunderbirdMessageTags() {
  if (hasCurrentMessageTagsApi()) {
    return browser.messages.tags.list();
  }

  if (hasLegacyMessageTagsApi()) {
    return browser.messages.listTags();
  }

  throw new Error("No Thunderbird message tag API is available.");
}

async function createThunderbirdMessageTag(tagName, tagColor) {
  if (hasCurrentMessageTagsApi()) {
    return browser.messages.tags.create(
      getSafeMessageTagKey(tagName),
      tagName,
      tagColor,
    );
  }

  if (hasLegacyMessageTagsApi()) {
    return browser.messages.createTag(tagName, tagName, tagColor);
  }

  throw new Error("No Thunderbird message tag API is available.");
}

async function getOrCreateThunderbirdMessageTag(tagName, tagColor) {
  const existingTags = await listThunderbirdMessageTags();
  const tag = existingTags.find((existingTag) => existingTag.tag === tagName);

  if (tag) {
    return tag;
  }

  return createThunderbirdMessageTag(tagName, tagColor);
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => applyI18n());
}
