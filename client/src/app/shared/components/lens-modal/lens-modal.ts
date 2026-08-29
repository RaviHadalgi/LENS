import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';

@Component({
  selector: 'app-lens-modal',
  standalone: true,
  templateUrl: './lens-modal.html',
  styleUrl: './lens-modal.css',
})
export class LensModal implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() title = '';
  @Input() description = '';
  @Input() closeOnBackdrop = true;

  @Output() closed = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      this.updateBodyScroll();
    }
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop) {
      this.close();
    }
  }

  onModalClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.close();
    }
  }

  private updateBodyScroll(): void {
    document.body.style.overflow = this.open ? 'hidden' : '';
  }
}