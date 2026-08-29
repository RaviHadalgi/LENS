import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-lens-form-field',
  standalone: true,
  templateUrl: './lens-form-field.html',
  styleUrl: './lens-form-field.css',
})
export class LensFormField {
  @Input() label = '';
  @Input() forId = '';
  @Input() hint = '';
  @Input() error = '';
  @Input() required = false;
}