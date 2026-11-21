import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, EMPTY, filter, switchMap, tap } from 'rxjs';
import { ApplicationService } from '../../core/services/application.service';

function routingNumberValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value;
  if (!val) return null;
  return /^\d{9}$/.test(val) ? null : { invalidRouting: true };
}

@Component({
  selector: 'app-application-wizard',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './application-wizard.html',
  styleUrl: './application-wizard.scss',
})
export class ApplicationWizard implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly appService = inject(ApplicationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input<string | undefined>();

  readonly applicationId = signal<string | null>(null);
  readonly step = signal(1);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly form = this.fb.group({
    business_name: ['', Validators.required],
    legal_entity_type: ['', Validators.required],
    registration_number: [''],
    industry_category: [''],
    website_url: [''],
    business_address: [''],
    owner_full_name: ['', Validators.required],
    owner_email: ['', [Validators.required, Validators.email]],
    owner_phone: [''],
    owner_tax_id: [''],
    bank_name: ['', Validators.required],
    routing_number: ['', [Validators.required, routingNumberValidator]],
    account_number: [''],
    expected_monthly_volume: [null as number | null],
    average_ticket_size: [null as number | null],
  });

  ngOnInit(): void {
    const existingId = this.id();
    if (existingId) {
      this.applicationId.set(existingId);
      this.appService.getById(existingId).subscribe(({ application }) => {
        this.form.patchValue(application, { emitEvent: false });
        this.step.set(application.current_step || 1);
      });
    } else {
      this.appService.createDraft().subscribe(({ application }) => {
        this.applicationId.set(application.id);
      });
    }

    this.form.valueChanges
      .pipe(
        debounceTime(800),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        filter(() => !!this.applicationId()),
        tap(() => this.saveStatus.set('saving')),
        switchMap((val) =>
          this.appService
            .saveDraft(this.applicationId()!, { ...val, current_step: this.step() })
            .pipe(
              tap(() => this.saveStatus.set('saved')),
              catchError(() => {
                this.saveStatus.set('error');
                return EMPTY;
              })
            )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  onSubmit(): void {
    if (this.form.invalid || !this.applicationId()) return;
    this.submitting.set(true);
    this.submitError.set(null);

    this.appService
      .saveDraft(this.applicationId()!, { ...this.form.getRawValue(), current_step: 4 })
      .pipe(switchMap(() => this.appService.submitApplication(this.applicationId()!)))
      .subscribe({
        next: () => this.router.navigate(['/applications', this.applicationId()]),
        error: (err) => {
          this.submitError.set(err?.error?.message || 'Submission failed.');
          this.submitting.set(false);
        },
      });
  }
}