import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-file-preview-modal',
  standalone: false,
  templateUrl: './file-preview-modal.component.html',
  styleUrl: './file-preview-modal.component.scss'
})
export class FilePreviewModalComponent {
  @Input() currentPreviewFile: any;
  @Input() previewLoading: boolean = false;
  @Input() previewError: string = '';
  @Input() previewUrl: string = '';
  @Input() currentPreviewType: string = '';
  @Input() currentPreviewIndex: number = 0;

  constructor(private sanitizer: DomSanitizer) {}

  @Output() downloadFile = new EventEmitter<{type: string, index: number}>();

  onDownloadFile() {
    this.downloadFile.emit({
      type: this.currentPreviewType,
      index: this.currentPreviewIndex
    });
  }

  // 文件类型检查方法
  isImageFile(filename: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return imageExtensions.includes(extension);
  }

  isPdfFile(filename: string): boolean {
    return filename.toLowerCase().endsWith('.pdf');
  }

  isOfficeFile(filename: string): boolean {
    const officeExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return officeExtensions.includes(extension);
  }

  // 获取文件扩展名
  getFileExtension(filename: string): string {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }

  // 获取文件类型的显示名称
  getFileTypeDisplayName(filename: string): string {
    const extension = this.getFileExtension(filename);
    switch (extension) {
      case '.xlsx':
      case '.xls':
        return 'Excel';
      case '.docx':
      case '.doc':
        return 'Word';
      case '.pptx':
      case '.ppt':
        return 'PowerPoint';
      default:
        return 'Office';
    }
  }

  // 获取安全的图片预览URL
  getSafeImageUrl(): SafeResourceUrl {
    if (this.previewUrl && this.isImageFile(this.currentPreviewFile?.originalName)) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl);
    }
    return '';
  }

  // 获取安全的PDF预览URL
  getSafePdfUrl(): SafeResourceUrl {
    if (this.previewUrl && this.isPdfFile(this.currentPreviewFile?.originalName)) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl);
    }
    return '';
  }
}
