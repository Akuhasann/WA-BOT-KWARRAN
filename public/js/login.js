document.addEventListener('DOMContentLoaded', function() {
    const qrCodeElement = document.getElementById('qr-code');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const refreshBtn = document.getElementById('refresh-btn');
    
    let pollingInterval;
    let currentStatus = 'disconnected';
    
    // Function to update the QR code
    async function updateQRCode() {
        try {
            const response = await fetch('/api/qrcode');
            const data = await response.json();
            
            // Update the status
            updateStatus(data.status, data.message);
            
            // Update the QR code if available
            if (data.qrcode) {
                qrCodeElement.innerHTML = `<img src="${data.qrcode}" alt="WhatsApp QR Code">`;
            } else if (data.status === 'authenticated' || data.status === 'connected') {
                qrCodeElement.innerHTML = `
                    <div class="success-message">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; color: #43A047;">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <p style="margin-top: 16px; font-weight: 500; color: #43A047;">Berhasil terhubung!</p>
                    </div>
                `;
            } else if (data.status === 'error') {
                qrCodeElement.innerHTML = `
                    <div class="error-message">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; color: #E53935;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <p style="margin-top: 16px; font-weight: 500; color: #E53935;">Gagal terhubung</p>
                    </div>
                `;
            } else {
                qrCodeElement.innerHTML = `
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <p>Menunggu QR Code...</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error fetching QR code:', error);
            updateStatus('error', 'Gagal mengambil QR code dari server');
            
            qrCodeElement.innerHTML = `
                <div class="error-message">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; color: #E53935;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p style="margin-top: 16px; font-weight: 500; color: #E53935;">Gagal terhubung ke server</p>
                </div>
            `;
        }
    }
    
    // Function to update the status indicator
    function updateStatus(status, message) {
        if (status === currentStatus) return;
        
        currentStatus = status;
        
        // Remove all status classes
        statusIndicator.classList.remove('disconnected', 'connecting', 'connected', 'authenticated', 'error');
        
        // Add the appropriate class
        statusIndicator.classList.add(status);
        
        // Update status text
        statusText.textContent = message || getStatusText(status);
        
        // If we're connected or authenticated, stop polling for the QR code
        if (status === 'connected' || status === 'authenticated') {
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            
            // Start polling status only
            if (!pollingInterval) {
                pollingInterval = setInterval(pollStatus, 5000);
            }
        }
    }
    
    // Get human-readable status text
    function getStatusText(status) {
        switch (status) {
            case 'disconnected':
                return 'Tidak terhubung';
            case 'connecting':
                return 'Menghubungkan...';
            case 'qr_ready':
                return 'Scan QR Code';
            case 'connected':
                return 'Terhubung';
            case 'authenticated':
                return 'Terautentikasi';
            case 'error':
                return 'Terjadi kesalahan';
            default:
                return 'Status tidak diketahui';
        }
    }
    
    // Function to poll the status only (after authentication)
    async function pollStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            updateStatus(data.status, data.message);
        } catch (error) {
            console.error('Error polling status:', error);
            updateStatus('error', 'Gagal terhubung ke server');
        }
    }
    
    // Function to refresh the QR code
    async function refreshQRCode() {
        qrCodeElement.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>Memperbarui QR Code...</p>
            </div>
        `;
        
        try {
            const response = await fetch('/api/refresh-qr', {
                method: 'POST',
            });
            const data = await response.json();
            
            if (data.status) {
                // Wait a moment, then start fetching the QR code
                setTimeout(updateQRCode, 2000);
            } else {
                updateStatus('error', data.message);
            }
        } catch (error) {
            console.error('Error refreshing QR code:', error);
            updateStatus('error', 'Gagal memperbarui QR code');
        }
    }
    
    // Add event listener to refresh button
    refreshBtn.addEventListener('click', refreshQRCode);
    
    // Start polling for QR code
    updateQRCode();
    pollingInterval = setInterval(updateQRCode, 5000);
});