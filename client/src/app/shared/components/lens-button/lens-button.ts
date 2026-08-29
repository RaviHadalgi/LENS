import { Component, Input } from '@angular/core';

export type LensButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger';

export type LensButtonSize =
  | 'small'
  | 'medium'
  | 'large';

@Component({
  selector: 'app-lens-button',
  standalone: true,
  templateUrl: './lens-button.html',
  styleUrl: './lens-button.css',
})
export class LensButton {
  @Input() variant: LensButtonVariant = 'primary';
  @Input() size: LensButtonSize = 'medium';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() fullWidth = false;
}