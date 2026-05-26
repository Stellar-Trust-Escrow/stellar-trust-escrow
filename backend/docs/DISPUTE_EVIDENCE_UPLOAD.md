# Dispute Evidence Upload System

This document describes the persistent evidence storage system for dispute resolution, which uses IPFS for decentralized file storage with virus scanning and thumbnail generation.

## Overview

The evidence upload system allows users to submit files and text as evidence in disputes. Files are stored on IPFS, scanned for viruses, and thumbnails are generated for images. The system supports real-time progress tracking via WebSocket notifications.

## Features

- **IPFS Storage**: Files are pinned to IPFS for persistent, decentralized storage
- **Virus Scanning**: All files are scanned using ClamAV before upload
- **Thumbnail Generation**: Automatic thumbnail creation for image files
- **File Validation**: Size limits (10MB), file type restrictions, and count limits (5 files)
- **Real-time Updates**: WebSocket notifications for upload progress and new evidence
- **Access Control**: Only dispute participants can upload evidence
- **Comprehensive Metadata**: File information, scan results, and IPFS CIDs stored in database

## API Endpoints

### Upload Evidence

```
POST /api/disputes/{id}/evidence
Content-Type: multipart/form-data
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
```

**Request Body:**
- `files`: Array of files (max 5, max 10MB each)
- `description`: Text description (optional)
- `role`: User role (optional, auto-detected if not provided)

**Response:**
```json
{
  "message": "Evidence uploaded successfully",
  "evidence": [
    {
      "id": 123,
      "evidenceType": "file",
      "filename": "contract.pdf",
      "mimeType": "application/pdf",
      "fileSize": 2048576,
      "ipfsCid": "QmXxx...",
      "thumbnailCid": null,
      "fileUrl": "https://ipfs.io/ipfs/QmXxx...",
      "scanStatus": "clean",
      "submittedBy": "GABC123...",
      "submittedAt": "2024-03-28T12:00:00Z"
    }
  ],
  "count": 1
}
```

### List Evidence

```
GET /api/disputes/{id}/evidence
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `evidenceType`: Filter by type (file, image, text, url, hash)
- `submittedBy`: Filter by submitter address

**Response:**
```json
{
  "items": [...],
  "total": 10,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

## File Type Support

### Accepted File Types
- **Images**: JPEG, PNG, GIF, WebP
- **Documents**: PDF, Word (.doc, .docx), Excel (.xls, .xlsx)
- **Text**: Plain text (.txt)
- **Archives**: ZIP files

### File Restrictions
- Maximum file size: 10MB per file
- Maximum files per upload: 5
- Executable files are blocked
- Virus-infected files are rejected

## IPFS Integration

### Configuration
Environment variables:
```env
IPFS_GATEWAY_URL=https://ipfs.io
IPFS_API_URL=https://api.thegraph.com/ipfs/api/v0
```

### File Storage Process
1. File is uploaded to memory buffer
2. Virus scan is performed
3. File is pinned to IPFS
4. Thumbnail generated for images
5. Metadata stored in database
6. IPFS CID returned for access

### Accessing Files
Files are accessible via IPFS gateway URLs:
```
https://ipfs.io/ipfs/{cid}
```

## Virus Scanning

### ClamAV Integration
The system uses ClamAV for virus scanning:
- Scans all files before IPFS upload
- Blocks infected files with detailed error messages
- Gracefully handles scanner unavailability
- Includes EICAR test signature detection

### Scan Results
- `pending`: Scan in progress
- `clean`: No threats detected
- `infected`: Malicious content detected
- `error`: Scan failed or scanner unavailable
- `skipped`: File too large for scanning

## WebSocket Events

### Subscribe to Dispute Updates
```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws');
ws.send(JSON.stringify({
  type: 'subscribe',
  topic: 'dispute:123'
}));
```

### Evidence Events
```json
{
  "type": "evidence_added",
  "disputeId": 123,
  "evidence": [...],
  "submittedBy": "GABC123...",
  "timestamp": "2024-03-28T12:00:00Z"
}
```

## Database Schema

### DisputeEvidence Table
```sql
CREATE TABLE dispute_evidence (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR NOT NULL,
  dispute_id INTEGER NOT NULL,
  submitted_by VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  evidence_type VARCHAR NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  filename TEXT,
  mime_type TEXT,
  file_size INTEGER,
  ipfs_cid TEXT,
  thumbnail_cid TEXT,
  scan_status VARCHAR DEFAULT 'pending',
  scan_result TEXT,
  submitted_at TIMESTAMP DEFAULT NOW()
);
```

## Error Handling

### Common Error Responses

**413 Payload Too Large**
```json
{
  "error": "File size exceeds 10MB limit"
}
```

**400 Bad Request - Virus Detected**
```json
{
  "error": "Virus detected",
  "message": "Malicious content found in: infected.exe",
  "infectedFiles": [
    {
      "filename": "infected.exe",
      "viruses": ["Trojan.Generic"]
    }
  ]
}
```

**403 Forbidden**
```json
{
  "error": "Access denied"
}
```

**500 Internal Server Error**
```json
{
  "error": "IPFS upload failed",
  "message": "Unable to upload files to IPFS"
}
```

## Testing

### Running Tests
```bash
npm test -- disputeEvidence.test.js
```

### Test Coverage
- File upload with various types
- Virus scanning with EICAR test file
- IPFS pinning and thumbnail generation
- Access control and authorization
- Error handling and edge cases
- WebSocket notifications

### EICAR Test File
The system includes EICAR antivirus test file detection:
```
X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*
```

## Security Considerations

### File Security
- All files scanned for viruses before storage
- File type restrictions prevent executable uploads
- Size limits prevent resource exhaustion
- IPFS provides content-addressed storage integrity

### Access Control
- JWT token authentication required
- Tenant isolation enforced
- Only dispute participants can upload evidence
- Role-based permissions enforced

### Data Privacy
- Files stored on decentralized IPFS network
- No sensitive data in filenames
- Scan results stored securely in database
- Access logged for audit trails

## Performance

### Optimization Features
- Memory-based file processing (no disk I/O)
- Parallel virus scanning and IPFS upload
- Thumbnail generation for images
- Efficient database queries with proper indexing

### Monitoring
- Upload progress tracking via WebSocket
- IPFS gateway health monitoring
- Virus scanner availability checks
- Error rate and performance metrics

## Deployment Requirements

### Dependencies
- ClamAV daemon (clamd) for virus scanning
- IPFS node or gateway access
- Sufficient memory for file processing (recommend 1GB+)
- Database with proper indexing

### Environment Configuration
```env
# IPFS Configuration
IPFS_GATEWAY_URL=https://ipfs.io
IPFS_API_URL=https://api.thegraph.com/ipfs/api/v0

# ClamAV Configuration
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# File Upload Limits
MAX_FILE_SIZE=10485760  # 10MB
MAX_FILES=5

# WebSocket Configuration
WS_HEARTBEAT_INTERVAL_MS=30000
WS_MAX_CONNECTIONS=100
```

## Troubleshooting

### Common Issues

**IPFS Upload Fails**
- Check IPFS gateway connectivity
- Verify API URL configuration
- Monitor IPFS node status

**Virus Scanner Errors**
- Ensure ClamAV daemon is running
- Check network connectivity to scanner
- Review scanner configuration

**File Upload Timeouts**
- Increase timeout values for large files
- Check network bandwidth
- Monitor server memory usage

### Debug Logging
Enable debug logging for troubleshooting:
```env
DEBUG=ipfs:*
DEBUG=clamscan:*
DEBUG=upload:*
```

## Future Enhancements

### Planned Features
- File encryption before IPFS upload
- Advanced image processing (OCR, watermarking)
- File deduplication across disputes
- Batch upload operations
- File expiration and cleanup policies

### Scalability Improvements
- Distributed IPFS pinning
- Load balancing for virus scanning
- CDN integration for file access
- Caching for frequently accessed files
