const DEFAULT_FILENAME_TEMPLATE = "{{CURRENT_DATETIME}}_{{ORIGINAL_NAME}}{{EXT}}";

function padFilenameDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatFilenameDate(date) {
  return [
    date.getFullYear(),
    padFilenameDatePart(date.getMonth() + 1),
    padFilenameDatePart(date.getDate()),
  ].join("-");
}

function formatFilenameTime(date) {
  return [
    padFilenameDatePart(date.getHours()),
    padFilenameDatePart(date.getMinutes()),
  ].join("-");
}

function formatFilenameDateTime(date) {
  return `${formatFilenameDate(date)}_${formatFilenameTime(date)}`;
}

function splitFilenameExtension(filename) {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return { nameWithoutExt: filename, extension: "" };
  }

  return {
    nameWithoutExt: filename.substring(0, lastDotIndex),
    extension: filename.substring(lastDotIndex),
  };
}

function replaceAllFilenamePlaceholders(template, replacements) {
  let filename = template;

  for (const [placeholder, value] of Object.entries(replacements)) {
    filename = filename.replace(
      new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
      value,
    );
  }

  return filename;
}

function sanitizeSuggestedFilename(filename) {
  return filename.replace(/[\/\\:*?"<>|@]/g, "_").trim();
}

function buildSuggestedFilename(originalFilename, options = {}) {
  const currentDate = options.currentDate
    ? new Date(options.currentDate)
    : new Date();
  const emailDate = options.emailDate ? new Date(options.emailDate) : currentDate;
  const template =
    options.template && options.template.trim()
      ? options.template.trim()
      : DEFAULT_FILENAME_TEMPLATE;
  const { nameWithoutExt, extension } = splitFilenameExtension(originalFilename);

  let filename = replaceAllFilenamePlaceholders(template, {
    "{{CURRENT_DATE}}": formatFilenameDate(currentDate),
    "{{CURRENT_TIME}}": formatFilenameTime(currentDate),
    "{{CURRENT_DATETIME}}": formatFilenameDateTime(currentDate),
    "{{EMAIL_DATE}}": formatFilenameDate(emailDate),
    "{{EMAIL_TIME}}": formatFilenameTime(emailDate),
    "{{EMAIL_DATETIME}}": formatFilenameDateTime(emailDate),
    "{{ORIGINAL_NAME}}": nameWithoutExt,
    "{{SUBJECT}}": nameWithoutExt,
    "{{AUTHOR}}": options.author || "",
    "{{EXT}}": extension,
  });

  filename = sanitizeSuggestedFilename(filename);

  if (extension && !/\.[^./\\]+$/.test(filename)) {
    filename = `${filename}${extension}`;
  }

  return filename || originalFilename;
}

window.FilenameTemplate = {
  DEFAULT_FILENAME_TEMPLATE,
  buildSuggestedFilename,
};
