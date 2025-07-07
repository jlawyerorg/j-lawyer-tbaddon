/* j-Lawyer Thunderbird Extension - AttachmentImageProcessor Class
Copyright (C) 2023, Maximilian Steinert

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */

class AttachmentImageProcessor {
    constructor() {
        this.editedImages = [];
        this.currentImageIndex = 0;
        this.originalImages = [];
        this.overlayWindow = null;
    }

    async processWithImageEditing(caseData, selectedCaseFolderID) {
        try {
            const messageData = await this.getDisplayedMessageFromActiveTab();
            const attachments = await browser.messages.listAttachments(messageData.id);
            
            const imageAttachments = await this.filterImageAttachments(attachments, messageData.id);
            const nonImageAttachments = await this.filterNonImageAttachments(attachments, messageData.id);
            
            if (imageAttachments.length === 0) {
                browser.runtime.sendMessage({ 
                    type: "error", 
                    content: "Keine Bildanhänge in der Nachricht gefunden." 
                });
                return;
            }

            await this.showImageEditOverlay(imageAttachments, nonImageAttachments, caseData, selectedCaseFolderID);
            
        } catch (error) {
            console.error("Fehler beim Verarbeiten der Bilder:", error);
            browser.runtime.sendMessage({ 
                type: "error", 
                content: "Fehler beim Verarbeiten der Bilder: " + error.message 
            });
        }
    }

    async getDisplayedMessageFromActiveTab() {
        return browser.mailTabs.query({active: true, currentWindow: true})
        .then((tabs) => {
            if (tabs.length === 0) {
                return browser.tabs.query({active: true, currentWindow: true});
            }
            return tabs;
        })
        .then((tabs) => {
            if (tabs.length === 0) {
                throw new Error("Kein aktiver Tab gefunden.");
            }
            let currentTabId = tabs[0].id;
            return browser.messageDisplay.getDisplayedMessage(currentTabId);
        })
        .then((message) => {
            if (!message) {
                throw new Error("Keine Nachricht im aktiven Tab angezeigt.");
            }
            return message;
        });
    }

    async filterImageAttachments(attachments, messageId) {
        console.log('filterImageAttachments called with', attachments.length, 'attachments');
        
        const imageAttachments = [];
        const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
        
        for (const attachment of attachments) {
            console.log('Checking attachment:', attachment.name, 'type:', attachment.contentType);
            
            const isImage = imageTypes.includes(attachment.contentType.toLowerCase()) || 
                           attachment.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);
            
            console.log('Is image:', isImage);
            
            if (isImage) {
                try {
                    console.log('Loading image attachment:', attachment.name);
                    const attachmentFile = await browser.messages.getAttachmentFile(messageId, attachment.partName);
                    const blob = new Blob([attachmentFile], { type: attachment.contentType });
                    
                    console.log('Image loaded successfully:', attachment.name, 'blob size:', blob.size);
                    
                    imageAttachments.push({
                        name: attachment.name,
                        contentType: attachment.contentType,
                        blob: blob,
                        size: attachment.size
                    });
                } catch (error) {
                    console.error(`Fehler beim Laden des Bildes ${attachment.name}:`, error);
                }
            }
        }
        
        console.log('Filtered', imageAttachments.length, 'image attachments');
        return imageAttachments;
    }

    async filterNonImageAttachments(attachments, messageId) {
        console.log('filterNonImageAttachments called with', attachments.length, 'attachments');
        
        const nonImageAttachments = [];
        const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
        
        for (const attachment of attachments) {
            console.log('Checking attachment:', attachment.name, 'type:', attachment.contentType);
            
            const isImage = imageTypes.includes(attachment.contentType.toLowerCase()) || 
                           attachment.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);
            
            console.log('Is image:', isImage);
            
            if (!isImage) {
                try {
                    console.log('Loading non-image attachment:', attachment.name);
                    const attachmentFile = await browser.messages.getAttachmentFile(messageId, attachment.partName);
                    const blob = new Blob([attachmentFile], { type: attachment.contentType });
                    
                    console.log('Non-image loaded successfully:', attachment.name, 'blob size:', blob.size);
                    
                    nonImageAttachments.push({
                        name: attachment.name,
                        contentType: attachment.contentType,
                        blob: blob,
                        size: attachment.size
                    });
                } catch (error) {
                    console.error(`Fehler beim Laden der Datei ${attachment.name}:`, error);
                }
            }
        }
        
        console.log('Filtered', nonImageAttachments.length, 'non-image attachments');
        return nonImageAttachments;
    }

    async showImageEditOverlay(imageAttachments, nonImageAttachments, caseData, selectedCaseFolderID) {
        this.originalImages = imageAttachments;
        this.nonImageAttachments = nonImageAttachments;
        this.editedImages = [];
        this.currentImageIndex = 0;
        this.caseData = caseData;
        this.selectedCaseFolderID = selectedCaseFolderID;

        // Daten im Storage für das Overlay speichern
        const imageDataPromises = imageAttachments.map(async img => ({
            name: img.name,
            contentType: img.contentType,
            size: img.size,
            // Blob als ArrayBuffer speichern
            data: await img.blob.arrayBuffer()
        }));
        
        const images = await Promise.all(imageDataPromises);
        
        await browser.storage.local.set({
            imageEditSession: {
                images: images,
                nonImageAttachments: nonImageAttachments,
                caseData: caseData,
                selectedCaseFolderID: selectedCaseFolderID,
                sessionActive: true
            }
        });

        const overlayUrl = browser.runtime.getURL("image-edit-overlay.html");
        this.overlayWindow = await browser.windows.create({
            url: overlayUrl,
            type: "popup",
            width: 1400,
            height: 1000
        });

        // Message Listener für Overlay-Kommunikation
        this.messageListener = this.handleOverlayMessage.bind(this);
        browser.runtime.onMessage.addListener(this.messageListener);
    }

    handleOverlayMessage(message, sender, sendResponse) {
        if (message.type === "overlay-ready") {
            this.initializeOverlay();
        } else if (message.type === "image-cropped") {
            this.handleImageCropped(message.imageData, message.fileName);
        } else if (message.type === "skip-image") {
            this.skipCurrentImage();
        } else if (message.type === "finish-editing") {
            this.finishEditing(message.createPDF);
        } else if (message.type === "cancel-editing") {
            this.cancelEditing();
        }
    }

    initializeOverlay() {
        console.log('initializeOverlay called, originalImages length:', this.originalImages.length);
        if (this.originalImages.length > 0) {
            this.sendImageToOverlay(this.currentImageIndex);
        } else {
            console.error('Keine Bilder zum Anzeigen vorhanden');
        }
    }

    async sendImageToOverlay(index) {
        console.log('sendImageToOverlay called with index:', index, 'total images:', this.originalImages.length);
        
        if (index >= this.originalImages.length) {
            this.showFinishOptions();
            return;
        }

        const image = this.originalImages[index];
        console.log('Sending image to overlay:', image.name, 'size:', image.blob.size);
        
        const imageUrl = URL.createObjectURL(image.blob);
        console.log('Created image URL:', imageUrl);
        
        browser.runtime.sendMessage({
            type: "load-image",
            imageUrl: imageUrl,
            fileName: image.name,
            currentIndex: index + 1,
            totalImages: this.originalImages.length
        });
    }

    handleImageCropped(imageData, fileName) {
        const blob = this.dataURLtoBlob(imageData);
        this.editedImages.push({
            name: fileName,
            blob: blob,
            contentType: 'image/png'
        });
        
        this.currentImageIndex++;
        this.sendImageToOverlay(this.currentImageIndex);
    }

    skipCurrentImage() {
        const originalImage = this.originalImages[this.currentImageIndex];
        this.editedImages.push({
            name: originalImage.name,
            blob: originalImage.blob,
            contentType: originalImage.contentType
        });
        
        this.currentImageIndex++;
        this.sendImageToOverlay(this.currentImageIndex);
    }

    showFinishOptions() {
        browser.runtime.sendMessage({
            type: "show-finish-options",
            imageCount: this.editedImages.length
        });
    }

    async finishEditing(createPDF) {
        if (this.overlayWindow) {
            await browser.windows.remove(this.overlayWindow.id);
        }
        
        // Message Listener entfernen
        if (this.messageListener) {
            browser.runtime.onMessage.removeListener(this.messageListener);
        }

        try {
            if (createPDF && this.editedImages.length > 0) {
                await this.createAndUploadPDF();
                // Auch nicht-Bild-Dateien einzeln hochladen
                if (this.nonImageAttachments && this.nonImageAttachments.length > 0) {
                    for (const attachment of this.nonImageAttachments) {
                        await this.uploadSingleFile(attachment.blob, attachment.name, attachment.contentType);
                    }
                }
            } else {
                await this.uploadIndividualImages();
            }
        } catch (error) {
            console.error("Fehler beim Abschließen der Bearbeitung:", error);
            browser.runtime.sendMessage({ 
                type: "error", 
                content: "Fehler beim Hochladen: " + error.message 
            });
        }
    }

    async createAndUploadPDF() {
        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF();
            
            let isFirstPage = true;
            
            for (const image of this.editedImages) {
                if (!isFirstPage) {
                    pdf.addPage();
                }
                
                const imageUrl = URL.createObjectURL(image.blob);
                const img = await this.loadImageElement(imageUrl);
                
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                
                const imgAspectRatio = img.width / img.height;
                const pdfAspectRatio = pdfWidth / pdfHeight;
                
                let imgWidth, imgHeight;
                
                if (imgAspectRatio > pdfAspectRatio) {
                    imgWidth = pdfWidth;
                    imgHeight = pdfWidth / imgAspectRatio;
                } else {
                    imgHeight = pdfHeight;
                    imgWidth = pdfHeight * imgAspectRatio;
                }
                
                const x = (pdfWidth - imgWidth) / 2;
                const y = (pdfHeight - imgHeight) / 2;
                
                pdf.addImage(img, 'PNG', x, y, imgWidth, imgHeight);
                isFirstPage = false;
            }
            
            const pdfBlob = pdf.output('blob');
            const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
            const pdfFileName = `Bilder_${timestamp}.pdf`;
            
            await this.uploadSingleFile(pdfBlob, pdfFileName, 'application/pdf');
            
        } catch (error) {
            console.error("Fehler beim Erstellen der PDF:", error);
            throw error;
        }
    }

    async uploadIndividualImages() {
        // Erst die bearbeiteten Bilder hochladen
        for (const image of this.editedImages) {
            await this.uploadSingleFile(image.blob, image.name, image.contentType);
        }
        
        // Dann die nicht-Bild-Dateien hochladen
        if (this.nonImageAttachments && this.nonImageAttachments.length > 0) {
            for (const attachment of this.nonImageAttachments) {
                await this.uploadSingleFile(attachment.blob, attachment.name, attachment.contentType);
            }
        }
    }

    async uploadSingleFile(blob, fileName, contentType) {
        const settings = await browser.storage.local.get(["username", "password", "serverAddress"]);
        
        const url = settings.serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';
        const headers = new Headers();
        const loginBase64Encoded = btoa(unescape(encodeURIComponent(settings.username + ':' + settings.password)));
        headers.append('Authorization', 'Basic ' + loginBase64Encoded);
        headers.append('Content-Type', 'application/json');

        const base64Content = await this.blobToBase64(blob);
        
        const requestData = {
            base64content: base64Content,
            caseId: this.caseData.id,
            fileName: fileName,
            folderId: this.selectedCaseFolderID
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log(`Datei ${fileName} erfolgreich hochgeladen:`, result);
    }

    async cancelEditing() {
        if (this.overlayWindow) {
            await browser.windows.remove(this.overlayWindow.id);
        }
        
        // Message Listener entfernen
        if (this.messageListener) {
            browser.runtime.onMessage.removeListener(this.messageListener);
        }
        
        // Session-Daten bereinigen
        try {
            await browser.storage.local.remove('imageEditSession');
        } catch (error) {
            console.error('Fehler beim Bereinigen der Session-Daten:', error);
        }
        
        browser.runtime.sendMessage({ 
            type: "error", 
            content: "Bildbearbeitung abgebrochen." 
        });
    }

    dataURLtoBlob(dataurl) {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    }

    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    loadImageElement(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
}

window.AttachmentImageProcessor = AttachmentImageProcessor;