import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-lens-toast',
  standalone: true,
  templateUrl: './lens-toast.html',
  styleUrl: './lens-toast.css',
})
export class LensToast {
  @Input({ required: true }) message = '';
  @Output() dismissed = new EventEmitter<void>();
}
