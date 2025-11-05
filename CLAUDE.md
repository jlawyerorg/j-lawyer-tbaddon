# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

j-lawyer.org Thunderbird Extension - A WebExtension for Thunderbird (v125+) that integrates with j-lawyer.org legal case management software. The extension enables users to save emails and attachments to cases, create calendar entries, and work with case documents and templates directly from Thunderbird.

**License:** AGPL-3.0
**Language:** JavaScript (vanilla, no build system)
**Manifest Version:** 2
**Minimum Thunderbird:** 125.0

## Development Commands

This project has no build system or package manager. All JavaScript is vanilla and runs directly in Thunderbird.

### Installation & Testing
- Load extension in Thunderbird: Tools → Add-ons → Debug Add-ons → "Load Temporary Add-on" → Select `manifest.json`
- Package for distribution: Create a ZIP file with all files (rename to `.xpi`)
- The extension ID is `steinert@steinertstrafrecht.com` (defined in manifest.json)

### Version Management
- Update version in `manifest.json` before creating releases
- Current version format: `X.Y.Z` (e.g., "1.7.5")

## Architecture Overview

### Core Components

1. **background.js** (~2167 lines)
   - Main background script handling all server communication
   - Manages message uploads (full email, message only, attachments only)
   - Handles MIME part extraction for inline attachments
   - Implements document tagging and folder management
   - Manages context menu creation and email template insertion
   - Key functions: `sendEmailToServer()`, `sendAttachmentsToServer()`, `sendAllMimePartsToServer()`

2. **popup.js** (~864 lines)
   - UI logic for main message display action popup
   - Case search and selection
   - Folder tree navigation
   - Attachment processing with optional image editing
   - Key functions: `findFileNumberInRawMessage()`, `searchCases()`, `updateData()`

3. **popup_compose.js** (~900+ lines)
   - UI logic for compose window integration
   - Case selection from subject line (auto-detection of file numbers)
   - Template and document insertion
   - Manages compose menu interactions

4. **background_menu.js** (~470 lines)
   - Context menu handlers for message list
   - Bulk message processing (multiple selected messages)
   - Implements `popup_menu_bundle_save.html` logic

5. **browser_action.js** (~205 lines)
   - Calendar entry creation from toolbar
   - Opens `cal.html` for creating appointments/deadlines/follow-ups

6. **attachment-image-processor.js** (~400 lines)
   - Handles image attachment editing workflow
   - Integrates with `image-edit-overlay.js` for the cropping UI
   - Manages PDF generation from edited images using jsPDF

7. **image-edit-overlay.js** (~1400+ lines)
   - Image cropping interface (uses Cropper.js patterns)
   - Reordering, renaming, and PDF merging of images
   - Storage-based communication with background scripts

### UI Components

- **popup.html** - Main popup when viewing a message
- **popup_compose.html** - Popup in compose window
- **popup_menu_bundle_save.html** - Bulk save dialog for multiple messages
- **cal.html** - Calendar entry creation dialog
- **options.html** - Extension settings page
- **image-edit-overlay.html** - Image editing overlay
- **updates.html** - Update/changelog display

### External Libraries

- **jspdf.umd.js** - PDF generation (bundled, ~940KB)
- See `VENDORS.md` for attribution

## j-Lawyer Server API

The extension communicates with a j-lawyer.org REST API:

### Base Endpoints (examples)
- `/j-lawyer-io/rest/v1/cases/list` - List all cases
- `/j-lawyer-io/rest/v1/cases/document/create` - Upload documents (PUT)
- `/j-lawyer-io/rest/v3/cases/{caseId}/folders` - Get case folder structure
- `/j-lawyer-io/rest/v5/cases/documents/{docId}/tags` - Set document tags (PUT)
- `/j-lawyer-io/rest/v6/templates/email/{templateName}/{caseId}` - Get email template with placeholders
- `/j-lawyer-io/rest/v7/configuration/optiongroups/document.tags` - Get available tags

### Authentication
All API calls use HTTP Basic Authentication:
```javascript
const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
headers.append('Authorization', 'Basic ' + loginBase64Encoded);
```

Credentials are stored **unencrypted** in `browser.storage.local`.

## Data Storage

Uses `browser.storage.local` for caching:
- `cases` - All case data (synchronized daily)
- `casesList` - Raw case list from server
- `documentTags` - Available document tags
- `emailTemplates` - Email template metadata
- `users` - Available users
- `calendars`, `followUpCalendars`, `respiteCalendars`, `eventCalendars` - Calendar data
- `lastUpdate` - Date of last data sync (YYYY-MM-DD format)
- `selectedTags` - Temporarily stores selected tags during operations
- `imageEditEnabled` - Boolean for image editing toggle
- `moveToTrash` - Boolean to move messages to trash after saving
- `activityLog` - Array of activity log entries

## Key Workflows

### 1. Saving Email to Case
- User opens message → popup.js loads
- Extension searches raw message for file numbers (automatic case detection)
- User can search for different case manually
- Select folder in tree, add tags (optional)
- Click "Speichern" → `sendEmailToServer()` in background.js
- Email saved as `.eml`, tagged with "veraktet"
- Optionally moved to trash

### 2. Saving Attachments with Image Editing
- User enables "Bildanhänge vor Speichern bearbeiten" toggle
- Clicks "Nur Anhänge"
- Image attachments open in overlay (`image-edit-overlay.html`)
- User crops, reorders, renames images
- Option to merge as single PDF
- Non-image attachments saved without editing
- All files uploaded to selected case/folder

### 3. Compose Window Integration
- User composes email → popup_compose.js loads
- Subject line analyzed for file numbers (auto-selects case)
- Context menu provides:
  - Insert email template (with placeholder substitution)
  - Attach document from case (hierarchical folder menu)
- After sending, email optionally saved to case

### 4. Bulk Message Processing
- Select multiple messages in list
- Right-click → "Nachrichten an j-Lawyer senden..."
- Select case, folder, tags once
- All selected messages processed sequentially

## Important Implementation Details

### MIME Part Handling
- `sendAttachmentsToServer()` processes regular attachments via `browser.messages.listAttachments()`
- `sendAllMimePartsToServer()` recursively processes MIME structure to catch inline/embedded attachments
- Includes fallback extraction from raw RFC2822 message when WebExtension API fails
- Skips main email body text (text/plain, text/html without filename)

### Menu Management
- Context menus dynamically created from templates/documents
- `composeMenuIds` Set tracks compose-related menus for cleanup
- Menus refresh when case selection changes
- File type emojis for visual identification: 📄 (PDF), 📝 (ODT), 🖼️ (images), etc.

### Folder Tree Building
- `buildFolderTree()` converts flat server response to hierarchical structure
- Empty folders hidden from menus (recursive check via `folderHasDocsOrNonEmptyChildren()`)
- Alphabetically sorted with folders before files

### File Naming & Deduplication
- Format: `YYYY-MM-DD_HH-MM_originalname.ext`
- Invalid characters (`/\:*?"<>|@`) replaced with `_`
- Duplicate handling: appends `_1`, `_2`, etc. before extension
- Checks against both server files and already-processed files in current session

### Error Handling
- Keine Exceptions ignorieren (per user's global .claude/CLAUDE.md)
- User feedback via `browser.runtime.sendMessage()` with `type: "error"` or `type: "success"`
- Errors logged to `activityLog` via `logActivity()`

## Testing Notes

- Test with j-lawyer.org server v2.6+ for full functionality
- Calendar features require server ≥ v2.6
- Test file upload with special characters in filenames
- Test MIME extraction with various email clients (inline images, embedded attachments)
- Verify folder tree rendering with deeply nested structures
- Test bulk operations with 10+ selected messages

## Known Quirks

- Attachment content extraction has multiple fallback methods due to Thunderbird API limitations
- `removeAttachmentsFromRFC2822()` is a manual RFC2822 parser (API method commented out as unavailable)
- Menu items must be created with `createComposeMenuItem()` wrapper to handle duplicate ID errors gracefully
- Storage-based communication used for image overlay instead of direct messaging (WebExtension context limitations)
- Daily data sync runs automatically on first popup open each day
