/* j-Lawyer Thunderbird Extension - Image Edit Overlay Logic
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

class ImageEditOverlay {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.currentImage = null;
        this.currentFileName = '';
        this.cropBox = null;
        this.isDragging = false;
        this.isResizing = false;
        this.dragStart = { x: 0, y: 0 };
        this.cropStart = { x: 0, y: 0, width: 0, height: 0 };
        this.resizeHandle = null;
        this.imageScale = 1;
        this.imageOffset = { x: 0, y: 0 };
        
        // Session-Daten
        this.sessionData = null;
        this.currentImageIndex = 0;
        this.editedImages = [];
        this.nonImageAttachments = [];
        
        // Zoom-Parameter
        this.zoomLevel = 1.0;
        this.minZoom = 0.2;
        this.maxZoom = 3.0;
        this.zoomStep = 0.2;
        
        this.initializeElements();
        this.setupEventListeners();
        this.loadSessionData();
    }

    initializeElements() {
        this.canvas = document.getElementById('imageCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.cropBox = document.getElementById('cropBox');
        
        const resetCropBtn = document.getElementById('resetCropBtn');
        const applyCropBtn = document.getElementById('applyCropBtn');
        const skipBtn = document.getElementById('skipBtn');
        const nextBtn = document.getElementById('nextBtn');
        const cancelBtn = document.getElementById('cancelBtn'); // Finish-Options Abbrechen Button
        const cancelBtnNormal = document.getElementById('cancelBtnNormal'); // Normaler Abbrechen Button
        const uploadIndividualBtn = document.getElementById('uploadIndividualBtn');
        const createPdfBtn = document.getElementById('createPdfBtn');
        const loadingSpinner = document.getElementById('loadingSpinner');
        
        // Vorschau-Elemente
        const previewImage = document.getElementById('previewImage');
        const previewInfo = document.getElementById('previewInfo');
        const prevImageBtn = document.getElementById('prevImageBtn');
        const nextImageBtn = document.getElementById('nextImageBtn');
        const renameBtn = document.getElementById('renameBtn');
        
        // Rename Dialog Elemente
        const renameDialog = document.getElementById('renameDialog');
        const filenameInput = document.getElementById('filenameInput');
        const filenameSuggestion = document.getElementById('filenameSuggestion');
        const useSuggestionBtn = document.getElementById('useSuggestionBtn');
        const cancelRenameBtn = document.getElementById('cancelRenameBtn');
        const confirmRenameBtn = document.getElementById('confirmRenameBtn');
        
        // PDF Rename Dialog Elemente
        const pdfRenameDialog = document.getElementById('pdfRenameDialog');
        const pdfFilenameInput = document.getElementById('pdfFilenameInput');
        const pdfFilenameSuggestion = document.getElementById('pdfFilenameSuggestion');
        const usePdfSuggestionBtn = document.getElementById('usePdfSuggestionBtn');
        const cancelPdfRenameBtn = document.getElementById('cancelPdfRenameBtn');
        const confirmPdfRenameBtn = document.getElementById('confirmPdfRenameBtn');
        
        this.elements = {
            resetCropBtn,
            applyCropBtn,
            skipBtn,
            nextBtn,
            cancelBtn,
            cancelBtnNormal,
            uploadIndividualBtn,
            createPdfBtn,
            loadingSpinner,
            previewImage,
            previewInfo,
            prevImageBtn,
            nextImageBtn,
            renameBtn,
            renameDialog,
            filenameInput,
            filenameSuggestion,
            useSuggestionBtn,
            cancelRenameBtn,
            confirmRenameBtn,
            pdfRenameDialog,
            pdfFilenameInput,
            pdfFilenameSuggestion,
            usePdfSuggestionBtn,
            cancelPdfRenameBtn,
            confirmPdfRenameBtn
        };
        
        // Vorschau-State
        this.previewIndex = 0;
    }

    setupEventListeners() {
        this.elements.resetCropBtn.addEventListener('click', () => {
            this.resetCrop();
            this.resetZoom();
        });
        this.elements.applyCropBtn.addEventListener('click', () => this.applyCrop());
        this.elements.skipBtn.addEventListener('click', () => this.skipImage());
        this.elements.nextBtn.addEventListener('click', () => this.nextImage());
        this.elements.cancelBtn.addEventListener('click', () => this.cancelEditing()); // Finish-Options Abbrechen
        this.elements.cancelBtnNormal.addEventListener('click', () => this.cancelEditing()); // Normaler Abbrechen
        this.elements.uploadIndividualBtn.addEventListener('click', () => this.finishEditing(false));
        this.elements.createPdfBtn.addEventListener('click', () => this.showPdfRenameDialog());
        
        // Vorschau-Navigation Event Listeners
        this.elements.prevImageBtn.addEventListener('click', () => this.showPreviousPreview());
        this.elements.nextImageBtn.addEventListener('click', () => this.showNextPreview());
        this.elements.renameBtn.addEventListener('click', () => this.showRenameDialog());
        
        // Rename Dialog Event Listeners
        this.elements.useSuggestionBtn.addEventListener('click', () => this.useSuggestion());
        this.elements.cancelRenameBtn.addEventListener('click', () => this.hideRenameDialog());
        this.elements.confirmRenameBtn.addEventListener('click', () => this.confirmRename());
        this.elements.filenameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.confirmRename();
            } else if (e.key === 'Escape') {
                this.hideRenameDialog();
            }
        });
        
        // PDF Rename Dialog Event Listeners
        this.elements.usePdfSuggestionBtn.addEventListener('click', () => this.usePdfSuggestion());
        this.elements.cancelPdfRenameBtn.addEventListener('click', () => this.hidePdfRenameDialog());
        this.elements.confirmPdfRenameBtn.addEventListener('click', () => this.confirmPdfRename());
        this.elements.pdfFilenameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.confirmPdfRename();
            } else if (e.key === 'Escape') {
                this.hidePdfRenameDialog();
            }
        });
        
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.onMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        
        this.cropBox.addEventListener('mousedown', (e) => this.onCropBoxMouseDown(e));
        
        browser.runtime.onMessage.addListener((message) => this.handleMessage(message));
    }

    async loadSessionData() {
        try {
            console.log('Loading session data...');
            const result = await browser.storage.local.get('imageEditSession');
            
            if (result.imageEditSession && result.imageEditSession.sessionActive) {
                this.sessionData = result.imageEditSession;
                this.nonImageAttachments = result.imageEditSession.nonImageAttachments || [];
                console.log('Session data loaded:', this.sessionData.images.length, 'images,', this.nonImageAttachments.length, 'non-image attachments');
                
                // Erstes Bild laden
                if (this.sessionData.images.length > 0) {
                    await this.loadCurrentImage();
                } else {
                    console.error('No images in session data');
                }
            } else {
                console.error('No active session found');
            }
        } catch (error) {
            console.error('Error loading session data:', error);
        }
    }

    async loadCurrentImage() {
        const imageData = this.sessionData.images[this.currentImageIndex];
        console.log('Loading image:', imageData.name, 'index:', this.currentImageIndex);
        
        this.currentFileName = imageData.name;
        document.getElementById('progressText').textContent = 
            `Bild ${this.currentImageIndex + 1} von ${this.sessionData.images.length}`;
        
        // ArrayBuffer zu Blob konvertieren
        const blob = new Blob([imageData.data], { type: imageData.contentType });
        const imageUrl = URL.createObjectURL(blob);
        
        const img = new Image();
        img.onload = () => {
            console.log('Image loaded successfully:', img.width, 'x', img.height);
            this.currentImage = img;
            this.drawImageToCanvas();
            this.resetCrop();
            this.showLoading(false);
        };
        img.onerror = (error) => {
            console.error('Fehler beim Laden des Bildes:', error);
            this.showLoading(false);
        };
        
        this.showLoading(true);
        img.src = imageUrl;
    }

    handleMessage(message) {
        switch (message.type) {
            case 'load-image':
                this.loadImage(message.imageUrl, message.fileName, message.currentIndex, message.totalImages);
                break;
            case 'show-finish-options':
                this.showFinishOptions(message.imageCount);
                break;
        }
    }

    async loadImage(imageUrl, fileName, currentIndex, totalImages) {
        console.log('loadImage called:', {imageUrl, fileName, currentIndex, totalImages});
        this.showLoading(true);
        this.currentFileName = fileName;
        
        document.getElementById('progressText').textContent = `Bild ${currentIndex} von ${totalImages}`;
        
        const img = new Image();
        img.onload = () => {
            console.log('Image loaded successfully:', img.width, 'x', img.height);
            this.currentImage = img;
            this.drawImageToCanvas();
            this.resetCrop();
            this.showLoading(false);
        };
        img.onerror = (error) => {
            console.error('Fehler beim Laden des Bildes:', error);
            console.error('Image URL war:', imageUrl);
            this.showLoading(false);
        };
        img.src = imageUrl;
    }

    drawImageToCanvas() {
        if (!this.currentImage) return;
        
        // Hole die tatsächliche Größe des Image-Containers
        const imageContainer = document.querySelector('.image-container');
        const containerWidth = imageContainer.clientWidth - 30;  // Noch weniger Padding
        const containerHeight = imageContainer.clientHeight - 30;
        
        console.log('Container dimensions:', containerWidth, 'x', containerHeight);
        console.log('Image dimensions:', this.currentImage.width, 'x', this.currentImage.height);
        
        if (containerWidth <= 0 || containerHeight <= 0) {
            console.error('Invalid container dimensions, using fallback');
            const containerWidth = 1200;  // Größerer Fallback
            const containerHeight = 800;
        }
        
        // Berechne optimale Größe basierend auf Container - maximale Darstellung
        const imgAspectRatio = this.currentImage.width / this.currentImage.height;
        
        // Versuche die Höhe zu maximieren
        let baseHeight = containerHeight * 0.98;  // 98% der Container-Höhe
        let baseWidth = baseHeight * imgAspectRatio;
        
        // Falls zu breit, an Breite anpassen
        if (baseWidth > containerWidth * 0.98) {
            baseWidth = containerWidth * 0.98;
            baseHeight = baseWidth / imgAspectRatio;
        }
        
        // Zoom berücksichtigen
        const canvasWidth = baseWidth * this.zoomLevel;
        const canvasHeight = baseHeight * this.zoomLevel;
        
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        
        // Zoom-Faktor für Crop-Berechnungen
        this.imageScale = canvasWidth / this.currentImage.width;
        this.baseScale = baseWidth / this.currentImage.width; // Basis-Skalierung ohne Zoom
        
        console.log('Final canvas size:', canvasWidth, 'x', canvasHeight, 'zoom:', this.zoomLevel, 'scale:', this.imageScale);
        
        this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        this.ctx.drawImage(this.currentImage, 0, 0, canvasWidth, canvasHeight);
    }

    onMouseDown(e) {
        // Prüfe ob es ein resize handle ist
        if (e.target.classList.contains('resize-handle')) {
            this.handleResizeStart(e);
            return;
        }
        
        // Prüfe ob es die cropBox selbst ist (für Verschieben)
        if (e.target === this.cropBox) {
            this.handleCropBoxMove(e);
            return;
        }
        
        // Nur Canvas-Klicks für neue Crop-Box
        if (e.target !== this.canvas) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Koordinaten sowohl für Canvas als auch CropBox merken
        this.isDragging = true;
        this.dragStart = { x, y }; // Canvas-Koordinaten
        
        // CropBox Position berechnen (relativ zum canvas-wrapper Container)
        const canvasRect = this.canvas.getBoundingClientRect();
        const wrapperRect = this.canvas.parentElement.getBoundingClientRect();
        const cropBoxStartX = canvasRect.left - wrapperRect.left + x;
        const cropBoxStartY = canvasRect.top - wrapperRect.top + y;
        
        this.cropBoxDragStart = { x: cropBoxStartX, y: cropBoxStartY }; // CropBox-Koordinaten
        
        console.log('onMouseDown - Canvas coords:', x, y);
        console.log('onMouseDown - Canvas rect:', canvasRect);
        console.log('onMouseDown - Wrapper rect:', wrapperRect);
        console.log('onMouseDown - CropBox start:', cropBoxStartX, cropBoxStartY);
        
        this.cropBox.style.left = cropBoxStartX + 'px';
        this.cropBox.style.top = cropBoxStartY + 'px';
        this.cropBox.style.width = '0px';
        this.cropBox.style.height = '0px';
        this.cropBox.style.display = 'block';
        this.cropBox.innerHTML = ''; // Handles entfernen
    }

    onMouseMove(e) {
        if (!this.isDragging && !this.isResizing) return;
        
        if (this.isDragging) {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Aktuelle CropBox Position berechnen (gleich wie in onMouseDown)
            const canvasRect = this.canvas.getBoundingClientRect();
            const wrapperRect = this.canvas.parentElement.getBoundingClientRect();
            const currentCropBoxX = canvasRect.left - wrapperRect.left + x;
            const currentCropBoxY = canvasRect.top - wrapperRect.top + y;
            
            // Korrekte Berechnung für alle Richtungen
            const startX = this.cropBoxDragStart.x;
            const startY = this.cropBoxDragStart.y;
            const endX = currentCropBoxX;
            const endY = currentCropBoxY;
            
            // Immer die kleineren Werte als Position verwenden
            const left = Math.min(startX, endX);
            const top = Math.min(startY, endY);
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);
            
            console.log('onMouseMove - Canvas coords:', x, y);
            console.log('onMouseMove - Current cropBox:', currentCropBoxX, currentCropBoxY);
            console.log('onMouseMove - Start:', startX, startY, 'End:', endX, endY);
            console.log('onMouseMove - Final box:', {left, top, width, height});
            
            this.cropBox.style.left = left + 'px';
            this.cropBox.style.top = top + 'px';
            this.cropBox.style.width = width + 'px';
            this.cropBox.style.height = height + 'px';
        }
    }

    onMouseUp() {
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        
        // Handles nur hinzufügen wenn cropBox groß genug ist
        if (this.cropBox.style.display === 'block' && 
            parseInt(this.cropBox.style.width) > 10 && 
            parseInt(this.cropBox.style.height) > 10) {
            this.addResizeHandles();
        }
    }

    handleResizeStart(e) {
        e.stopPropagation();
        e.preventDefault();
        
        this.isResizing = true;
        this.resizeHandle = e.target;
        this.dragStart = { x: e.clientX, y: e.clientY };
        
        console.log('Starting resize with handle:', e.target.className);
    }

    handleCropBoxMove(e) {
        e.stopPropagation();
        e.preventDefault();
        
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        
        // Aktuelle Position der CropBox merken
        this.cropBoxStart = {
            left: parseInt(this.cropBox.style.left),
            top: parseInt(this.cropBox.style.top)
        };
        
        console.log('Starting crop box move');
    }

    onWheel(e) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -this.zoomStep : this.zoomStep;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + delta));
        
        if (newZoom !== this.zoomLevel) {
            console.log('Zoom changed from', this.zoomLevel, 'to', newZoom);
            this.zoomLevel = newZoom;
            this.drawImageToCanvas();
            this.resetCrop(); // Crop-Box zurücksetzen bei Zoom
        }
    }

    onCropBoxMouseDown(e) {
        e.stopPropagation();
        e.preventDefault();
        
        if (e.target.classList.contains('resize-handle')) {
            this.isResizing = true;
            this.resizeHandle = e.target;
            this.dragStart = { x: e.clientX, y: e.clientY };
        } else {
            this.isDragging = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
            const rect = this.cropBox.getBoundingClientRect();
            this.cropStart = {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
            };
        }
    }

    addResizeHandles() {
        this.cropBox.innerHTML = `
            <div class="resize-handle top-left"></div>
            <div class="resize-handle top-right"></div>
            <div class="resize-handle bottom-left"></div>
            <div class="resize-handle bottom-right"></div>
        `;
        
        this.cropBox.querySelectorAll('.resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => this.onCropBoxMouseDown(e));
        });
    }

    resetCrop() {
        this.cropBox.style.display = 'none';
        this.cropBox.innerHTML = '';
    }

    resetZoom() {
        this.zoomLevel = 1.0;
        this.drawImageToCanvas();
        this.resetCrop();
    }

    async applyCrop() {
        console.log('applyCrop called, currentImage:', this.currentImage);
        
        if (!this.currentImage) {
            console.error('Kein Bild geladen für Zuschnitt');
            return;
        }
        
        // Direkt verarbeiten ohne Message-Sending
        await this.processCurrentImage();
        
        // Zum nächsten Bild oder Ende
        this.currentImageIndex++;
        if (this.currentImageIndex >= this.sessionData.images.length) {
            this.showFinishOptions(this.editedImages.length);
        } else {
            await this.loadCurrentImage();
        }
    }

    async skipImage() {
        // Original Bild ohne Änderungen zu editedImages hinzufügen
        if (this.currentImage) {
            const originalCanvas = document.createElement('canvas');
            const originalCtx = originalCanvas.getContext('2d');
            
            originalCanvas.width = this.currentImage.width;
            originalCanvas.height = this.currentImage.height;
            
            originalCtx.drawImage(this.currentImage, 0, 0);
            const processedImageData = originalCanvas.toDataURL('image/png');
            
            const blob = this.dataURLtoBlob(processedImageData);
            this.editedImages.push({
                name: this.currentFileName,
                blob: blob,
                contentType: 'image/png'
            });
            
            console.log('Image skipped (original kept):', this.currentFileName);
        }
        
        // Zum nächsten Bild
        this.currentImageIndex++;
        if (this.currentImageIndex >= this.sessionData.images.length) {
            this.showFinishOptions(this.editedImages.length);
        } else {
            await this.loadCurrentImage();
        }
    }

    async nextImage() {
        // Aktuelles Bild verarbeiten
        await this.processCurrentImage();
        
        // Zum nächsten Bild oder zu den Finish-Optionen
        this.currentImageIndex++;
        if (this.currentImageIndex >= this.sessionData.images.length) {
            this.showFinishOptions(this.editedImages.length);
        } else {
            await this.loadCurrentImage();
        }
    }

    async processCurrentImage() {
        if (!this.currentImage) {
            console.error('Kein Bild geladen für Verarbeitung');
            return;
        }
        
        let processedImageData;
        
        if (this.cropBox.style.display === 'none' || 
            parseInt(this.cropBox.style.width) < 10 || 
            parseInt(this.cropBox.style.height) < 10) {
            
            // Kein Zuschnitt - original Bild verwenden
            const originalCanvas = document.createElement('canvas');
            const originalCtx = originalCanvas.getContext('2d');
            
            originalCanvas.width = this.currentImage.width;
            originalCanvas.height = this.currentImage.height;
            
            originalCtx.drawImage(this.currentImage, 0, 0);
            processedImageData = originalCanvas.toDataURL('image/png');
            
            console.log('Using original image - no crop applied');
        } else {
            // Zuschnitt anwenden - vereinfachte Berechnung
            const canvasRect = this.canvas.getBoundingClientRect();
            const parentRect = this.canvas.parentElement.getBoundingClientRect();
            
            // CropBox Position relativ zum Canvas
            const cropBoxLeft = parseInt(this.cropBox.style.left);
            const cropBoxTop = parseInt(this.cropBox.style.top);
            const cropBoxWidth = parseInt(this.cropBox.style.width);
            const cropBoxHeight = parseInt(this.cropBox.style.height);
            
            // Canvas-Offset
            const canvasOffsetLeft = canvasRect.left - parentRect.left;
            const canvasOffsetTop = canvasRect.top - parentRect.top;
            
            // Crop-Koordinaten auf dem Canvas
            const cropX = (cropBoxLeft - canvasOffsetLeft) / this.imageScale;
            const cropY = (cropBoxTop - canvasOffsetTop) / this.imageScale;
            const cropWidth = cropBoxWidth / this.imageScale;
            const cropHeight = cropBoxHeight / this.imageScale;
            
            console.log('Crop coordinates:', cropX, cropY, cropWidth, cropHeight);
            
            const croppedCanvas = document.createElement('canvas');
            const croppedCtx = croppedCanvas.getContext('2d');
            
            croppedCanvas.width = cropWidth;
            croppedCanvas.height = cropHeight;
            
            croppedCtx.drawImage(
                this.currentImage,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, cropWidth, cropHeight
            );
            
            processedImageData = croppedCanvas.toDataURL('image/png');
            console.log('Crop applied successfully');
        }
        
        // Verarbeitetes Bild zu editedImages hinzufügen
        const blob = this.dataURLtoBlob(processedImageData);
        this.editedImages.push({
            name: this.currentFileName,
            blob: blob,
            contentType: 'image/png'
        });
        
        console.log('Image processed:', this.currentFileName, 'Total images:', this.editedImages.length);
    }

    async cancelEditing() {
        // Session-Daten bereinigen
        try {
            await browser.storage.local.remove('imageEditSession');
        } catch (error) {
            console.error('Fehler beim Bereinigen der Session-Daten:', error);
        }
        
        browser.runtime.sendMessage({
            type: 'cancel-editing'
        });
        
        // Overlay-Fenster schließen
        window.close();
    }

    async finishEditing(createPDF, pdfFileName = null) {
        this.showLoading(true);
        
        try {
            console.log('finishEditing called with createPDF:', createPDF, 'editedImages count:', this.editedImages.length);
            
            if (createPDF && this.editedImages.length > 0) {
                console.log('Creating PDF with images...');
                await this.createAndUploadPDF(pdfFileName);
                console.log('PDF creation and upload completed');
                
                // Auch nicht-Bild-Dateien einzeln hochladen
                if (this.nonImageAttachments && this.nonImageAttachments.length > 0) {
                    console.log('Uploading non-image attachments...');
                    const timestampPrefix = this.generateTimestampPrefix();
                    for (const attachment of this.nonImageAttachments) {
                        const timestampedFileName = `${timestampPrefix}${attachment.name}`;
                        await this.uploadSingleFile(attachment.blob, timestampedFileName, attachment.contentType);
                    }
                    console.log('Non-image attachments uploaded');
                }
            } else {
                console.log('Uploading individual images...');
                await this.uploadIndividualImages();
                console.log('Individual image upload completed');
            }
            
            // Session beenden
            await browser.storage.local.remove('imageEditSession');
            console.log('Session ended, closing window');
            window.close();
        } catch (error) {
            console.error("Fehler beim Abschließen der Bearbeitung:", error);
            alert("Fehler beim Hochladen: " + error.message);
            this.showLoading(false);
        }
    }

    showFinishOptions(imageCount) {
        this.showLoading(false);
        
        document.querySelector('.main-content').style.display = 'none';
        document.getElementById('finishOptions').style.display = 'block';
        
        // Status-Text mit allen Dateien
        let statusText = `${imageCount} Bild(er) bearbeitet`;
        if (this.nonImageAttachments && this.nonImageAttachments.length > 0) {
            statusText += ` + ${this.nonImageAttachments.length} weitere Datei(en)`;
        }
        document.getElementById('progressText').textContent = statusText;
        
        // Button-Text anpassen
        let pdfButtonText;
        if (imageCount === 1) {
            pdfButtonText = 'Als PDF speichern';
        } else {
            pdfButtonText = `${imageCount} Bilder als PDF zusammenfassen`;
        }
        
        // Zusatz für andere Dateien hinzufügen
        if (this.nonImageAttachments && this.nonImageAttachments.length > 0) {
            pdfButtonText += ` + ${this.nonImageAttachments.length} weitere Datei(en)`;
        }
        
        this.elements.createPdfBtn.textContent = pdfButtonText;
        
        // Einzeln hochladen Button Text anpassen
        let uploadText = 'Einzeln hochladen';
        if (this.nonImageAttachments && this.nonImageAttachments.length > 0) {
            const totalFiles = imageCount + this.nonImageAttachments.length;
            uploadText = `Alle ${totalFiles} Dateien einzeln hochladen`;
        }
        this.elements.uploadIndividualBtn.textContent = uploadText;
        
        // Upload-Info anzeigen
        const uploadInfo = document.getElementById('uploadInfo');
        const additionalFilesInfo = document.getElementById('additionalFilesInfo');
        
        if (uploadInfo) {
            uploadInfo.style.display = 'block';
            
            if (this.nonImageAttachments && this.nonImageAttachments.length > 0) {
                if (additionalFilesInfo) {
                    additionalFilesInfo.style.display = 'block';
                }
            } else {
                if (additionalFilesInfo) {
                    additionalFilesInfo.style.display = 'none';
                }
            }
        }
        
        // Bildvorschau initialisieren
        this.initializePreview();
    }

    showLoading(show) {
        this.elements.loadingSpinner.style.display = show ? 'flex' : 'none';
    }

    initializePreview() {
        console.log('Initializing preview with', this.editedImages.length, 'images');
        
        if (this.editedImages.length === 0) {
            this.elements.previewImage.style.display = 'none';
            this.elements.previewInfo.textContent = 'Keine Bilder verfügbar';
            this.elements.prevImageBtn.disabled = true;
            this.elements.nextImageBtn.disabled = true;
            return;
        }
        
        this.previewIndex = 0;
        this.updatePreview();
    }

    updatePreview() {
        if (this.editedImages.length === 0) return;
        
        const currentImage = this.editedImages[this.previewIndex];
        
        // Vorherige URL freigeben um Memory Leak zu vermeiden
        if (this.elements.previewImage.src && this.elements.previewImage.src.startsWith('blob:')) {
            URL.revokeObjectURL(this.elements.previewImage.src);
        }
        
        const imageUrl = URL.createObjectURL(currentImage.blob);
        
        this.elements.previewImage.src = imageUrl;
        this.elements.previewImage.style.display = 'block';
        this.elements.previewInfo.textContent = `${this.previewIndex + 1} / ${this.editedImages.length}`;
        
        // Navigation-Buttons aktualisieren
        const isFirstImage = this.previewIndex === 0;
        const isLastImage = this.previewIndex === this.editedImages.length - 1;
        const hasMultipleImages = this.editedImages.length > 1;
        
        this.elements.prevImageBtn.disabled = isFirstImage || !hasMultipleImages;
        this.elements.nextImageBtn.disabled = isLastImage || !hasMultipleImages;
        
        console.log('Preview updated:', this.previewIndex + 1, 'of', this.editedImages.length, 
                   'prevDisabled:', this.elements.prevImageBtn.disabled, 
                   'nextDisabled:', this.elements.nextImageBtn.disabled);
    }

    showPreviousPreview() {
        console.log('showPreviousPreview called, current index:', this.previewIndex);
        if (this.previewIndex > 0 && this.editedImages.length > 1) {
            this.previewIndex--;
            console.log('Moving to previous image, new index:', this.previewIndex);
            this.updatePreview();
        } else {
            console.log('Cannot go to previous image - at first image or only one image');
        }
    }

    showNextPreview() {
        console.log('showNextPreview called, current index:', this.previewIndex);
        if (this.previewIndex < this.editedImages.length - 1 && this.editedImages.length > 1) {
            this.previewIndex++;
            console.log('Moving to next image, new index:', this.previewIndex);
            this.updatePreview();
        } else {
            console.log('Cannot go to next image - at last image or only one image');
        }
    }

    async createAndUploadPDF(customFileName = null) {
        try {
            console.log('Starting PDF creation with', this.editedImages.length, 'images');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF();
            
            let isFirstPage = true;
            
            for (let i = 0; i < this.editedImages.length; i++) {
                const image = this.editedImages[i];
                console.log(`Processing image ${i + 1}/${this.editedImages.length}: ${image.name}`);
                
                if (!isFirstPage) {
                    pdf.addPage();
                }
                
                try {
                    // Bild komprimieren vor dem Hinzufügen zur PDF
                    console.log('Compressing image for PDF:', image.name, 'original size:', image.blob.size);
                    const compressedImageData = await this.compressImageForPDF(image.blob);
                    console.log('Image compressed successfully, new size:', compressedImageData.length);
                    
                    // PDF-Dimensionen
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    
                    // Bildabmessungen aus komprimiertem Bild ermitteln
                    const tempImg = await this.loadImageElement(compressedImageData);
                    const imgAspectRatio = tempImg.width / tempImg.height;
                    const pdfAspectRatio = pdfWidth / pdfHeight;
                    
                    // Optimale Bildgröße unter Beibehaltung des Seitenverhältnisses berechnen
                    let imgWidth, imgHeight;
                    const maxScale = 0.9; // 90% der Seitengröße verwenden
                    
                    if (imgAspectRatio > pdfAspectRatio) {
                        // Bild ist breiter als PDF-Seite - an Breite anpassen
                        imgWidth = pdfWidth * maxScale;
                        imgHeight = imgWidth / imgAspectRatio;
                    } else {
                        // Bild ist höher als PDF-Seite - an Höhe anpassen
                        imgHeight = pdfHeight * maxScale;
                        imgWidth = imgHeight * imgAspectRatio;
                    }
                    
                    // Zentrieren
                    const x = (pdfWidth - imgWidth) / 2;
                    const y = (pdfHeight - imgHeight) / 2;
                    
                    // Komprimiertes Bild zur PDF hinzufügen mit korrekten Proportionen
                    pdf.addImage(compressedImageData, 'JPEG', x, y, imgWidth, imgHeight);
                    
                    console.log('Compressed image added to PDF successfully:', image.name);
                    
                } catch (imageError) {
                    console.error('Error processing image for PDF:', image.name, imageError);
                    // Weiter mit dem nächsten Bild, anstatt abzubrechen
                    continue;
                }
                
                isFirstPage = false;
            }
            
            console.log('PDF creation completed, generating blob...');
            const pdfBlob = pdf.output('blob');
            
            // Dateiname festlegen
            let pdfFileName;
            if (customFileName) {
                pdfFileName = customFileName;
            } else {
                const timestampPrefix = this.generateTimestampPrefix();
                pdfFileName = `${timestampPrefix}Bilder.pdf`;
            }
            
            console.log('PDF file size:', pdfBlob.size, 'bytes');
            console.log('Uploading PDF file:', pdfFileName);
            await this.uploadSingleFile(pdfBlob, pdfFileName, 'application/pdf');
            console.log('PDF upload completed successfully');
            
        } catch (error) {
            console.error("Fehler beim Erstellen der PDF:", error);
            throw error;
        }
    }

    async uploadIndividualImages() {
        const timestampPrefix = this.generateTimestampPrefix();
        
        // Erst die bearbeiteten Bilder hochladen
        for (const image of this.editedImages) {
            const timestampedFileName = `${timestampPrefix}${image.name}`;
            await this.uploadSingleFile(image.blob, timestampedFileName, image.contentType);
        }
        
        // Dann die nicht-Bild-Dateien hochladen
        if (this.nonImageAttachments && this.nonImageAttachments.length > 0) {
            for (const attachment of this.nonImageAttachments) {
                const timestampedFileName = `${timestampPrefix}${attachment.name}`;
                await this.uploadSingleFile(attachment.blob, timestampedFileName, attachment.contentType);
            }
        }
    }

    async uploadSingleFile(blob, fileName, contentType) {
        console.log('uploadSingleFile called for:', fileName, 'type:', contentType, 'size:', blob.size);
        
        const settings = await browser.storage.local.get(["username", "password", "serverAddress"]);
        console.log('Settings loaded, serverAddress:', settings.serverAddress);
        
        if (!this.sessionData || !this.sessionData.caseData) {
            throw new Error('Session data or case data is missing');
        }
        
        const url = settings.serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';
        const headers = new Headers();
        const loginBase64Encoded = btoa(unescape(encodeURIComponent(settings.username + ':' + settings.password)));
        headers.append('Authorization', 'Basic ' + loginBase64Encoded);
        headers.append('Content-Type', 'application/json');

        console.log('Converting blob to base64...');
        const base64Content = await this.blobToBase64(blob);
        console.log('Base64 conversion completed, length:', base64Content.length);
        
        const requestData = {
            base64content: base64Content,
            caseId: this.sessionData.caseData.id,
            fileName: fileName,
            folderId: this.sessionData.selectedCaseFolderID
        };

        console.log('Uploading to URL:', url, 'caseId:', this.sessionData.caseData.id, 'folderId:', this.sessionData.selectedCaseFolderID);
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Upload failed with status:', response.status, 'response:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`Datei ${fileName} erfolgreich hochgeladen:`, result);
    }

    generateTimestampPrefix() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}_${hours}-${minutes}_`;
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

    async compressImageForPDF(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = () => {
                // Zielauflösung für PDF (optimiert für A4-Seiten)
                const maxWidth = 1200;  // Maximale Breite
                const maxHeight = 1600; // Maximale Höhe
                
                // Seitenverhältnis berechnen
                let { width, height } = img;
                const aspectRatio = width / height;
                
                // Größe anpassen wenn nötig
                if (width > maxWidth) {
                    width = maxWidth;
                    height = width / aspectRatio;
                }
                
                if (height > maxHeight) {
                    height = maxHeight;
                    width = height * aspectRatio;
                }
                
                console.log(`Resizing image from ${img.width}x${img.height} to ${width}x${height}`);
                
                // Canvas-Größe setzen
                canvas.width = width;
                canvas.height = height;
                
                // Bild auf Canvas zeichnen (skaliert)
                ctx.drawImage(img, 0, 0, width, height);
                
                // Als komprimiertes JPEG ausgeben (Qualität 0.8 = 80%)
                const dataURL = canvas.toDataURL('image/jpeg', 0.8);
                
                console.log('Image compression completed');
                resolve(dataURL);
            };
            
            img.onerror = reject;
            
            // Blob als URL laden
            const url = URL.createObjectURL(blob);
            img.src = url;
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
    
    showRenameDialog() {
        if (this.editedImages.length === 0) return;
        
        const currentImage = this.editedImages[this.previewIndex];
        const timestampPrefix = this.generateTimestampPrefix();
        
        // Dateiname aufteilen
        const fileName = currentImage.name;
        const lastDotIndex = fileName.lastIndexOf('.');
        const nameWithoutExtension = lastDotIndex > -1 ? fileName.substring(0, lastDotIndex) : fileName;
        const extension = lastDotIndex > -1 ? fileName.substring(lastDotIndex) : '';
        
        // Vorschlag mit Zeitstempel erstellen
        const suggestion = timestampPrefix + nameWithoutExtension + extension;
        this.elements.filenameSuggestion.textContent = suggestion;
        
        // Input-Feld mit aktuellem kompletten Namen füllen
        this.elements.filenameInput.value = fileName;
        this.elements.filenameInput.select();
        
        // Dialog anzeigen
        this.elements.renameDialog.style.display = 'flex';
        this.elements.filenameInput.focus();
    }
    
    hideRenameDialog() {
        this.elements.renameDialog.style.display = 'none';
    }
    
    useSuggestion() {
        // Vorschlag in das Input-Feld übernehmen
        const suggestion = this.elements.filenameSuggestion.textContent;
        this.elements.filenameInput.value = suggestion;
        this.elements.filenameInput.select();
        this.elements.filenameInput.focus();
    }
    
    confirmRename() {
        const newFileName = this.elements.filenameInput.value.trim();
        
        if (!newFileName) {
            alert('Bitte geben Sie einen gültigen Dateinamen ein.');
            return;
        }
        
        // Ungültige Zeichen prüfen
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(newFileName)) {
            alert('Der Dateiname enthält ungültige Zeichen: < > : " / \\ | ? *');
            return;
        }
        
        // Aktuelles Bild umbenennen
        if (this.previewIndex < this.editedImages.length) {
            this.editedImages[this.previewIndex].name = newFileName;
            console.log('Image renamed to:', newFileName);
        }
        
        // Dialog schließen
        this.hideRenameDialog();
    }
    
    showPdfRenameDialog() {
        const timestampPrefix = this.generateTimestampPrefix();
        
        // Vorschlag mit Zeitstempel erstellen
        const suggestion = `${timestampPrefix}Bilder.pdf`;
        this.elements.pdfFilenameSuggestion.textContent = suggestion;
        
        // Input-Feld mit Vorschlag füllen
        this.elements.pdfFilenameInput.value = suggestion;
        this.elements.pdfFilenameInput.select();
        
        // Dialog anzeigen
        this.elements.pdfRenameDialog.style.display = 'flex';
        this.elements.pdfFilenameInput.focus();
    }
    
    hidePdfRenameDialog() {
        this.elements.pdfRenameDialog.style.display = 'none';
    }
    
    usePdfSuggestion() {
        // Vorschlag in das Input-Feld übernehmen
        const suggestion = this.elements.pdfFilenameSuggestion.textContent;
        this.elements.pdfFilenameInput.value = suggestion;
        this.elements.pdfFilenameInput.select();
        this.elements.pdfFilenameInput.focus();
    }
    
    async confirmPdfRename() {
        const pdfFileName = this.elements.pdfFilenameInput.value.trim();
        
        if (!pdfFileName) {
            alert('Bitte geben Sie einen gültigen PDF-Dateinamen ein.');
            return;
        }
        
        // Ungültige Zeichen prüfen
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(pdfFileName)) {
            alert('Der Dateiname enthält ungültige Zeichen: < > : " / \\ | ? *');
            return;
        }
        
        // Sicherstellen, dass die Datei mit .pdf endet
        let finalFileName = pdfFileName;
        if (!finalFileName.toLowerCase().endsWith('.pdf')) {
            finalFileName += '.pdf';
        }
        
        console.log('PDF will be created with filename:', finalFileName);
        
        // Dialog schließen
        this.hidePdfRenameDialog();
        
        // PDF mit dem gewählten Namen erstellen
        await this.finishEditing(true, finalFileName);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ImageEditOverlay();
});