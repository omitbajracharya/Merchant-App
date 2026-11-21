import { Component, OnInit, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '../../core/services/application.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  MerchantApplication,
  ReviewDecision,
  ReviewerOption,
  RiskReview,
  SensitiveFieldName,
} from '../../core/models/application.model';

@Component({
  selector: 'app-application-detail',
  imports: [RouterLink, CurrencyPipe, DatePipe, ReactiveFormsModule, FormsModule],
  templateUrl: './application-detail.html',
  styleUrl: './application-detail.scss',
})
export class ApplicationDetail implements OnInit {
  private readonly appService = inject(ApplicationService);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  readonly app = signal<MerchantApplication | null>(null);
  readonly reviews = signal<RiskReview[]>([]);
  readonly reviewers = signal<ReviewerOption[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly revealedTaxId = signal<string | null>(null);
  readonly revealedAccount = signal<string | null>(null);
  selectedReviewerId: string | null = null;

  readonly reviewForm = this.fb.nonNullable.group({
    decision: ['APPROVED' as ReviewDecision, Validators.required],
    riskScore: [25 as number | null],
    notes: ['', [Validators.required, Validators.minLength(5)]],
  });

  ngOnInit(): void {
    this.loadDetail();
    if (this.auth.isAdmin()) {
      this.appService.getReviewers().subscribe((res) => this.reviewers.set(res.reviewers));
    }
  }

  loadDetail(): void {
    this.loading.set(true);
    this.appService.getById(this.id()).subscribe({
      next: (res) => {
        this.app.set(res.application);
        this.reviews.set(res.reviews);
        this.selectedReviewerId = res.application.assigned_reviewer_id;
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load application.');
        this.loading.set(false);
      },
    });
  }

  reveal(field: SensitiveFieldName): void {
    this.appService.revealSensitiveField(this.id(), field).subscribe((res) => {
      if (field === 'owner_tax_id') this.revealedTaxId.set(res.value);
      if (field === 'account_number') this.revealedAccount.set(res.value);
    });
  }

  assignReviewer(): void {
    this.appService.assignReviewer(this.id(), this.selectedReviewerId).subscribe(() => this.loadDetail());
  }

  submitReview(): void {
    if (this.reviewForm.invalid) return;
    this.appService.submitReview(this.id(), this.reviewForm.getRawValue()).subscribe(() => {
      this.reviewForm.reset({ decision: 'APPROVED', riskScore: 25, notes: '' });
      this.loadDetail();
    });
  }
}