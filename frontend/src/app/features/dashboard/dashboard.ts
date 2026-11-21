import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '../../core/services/application.service';
import { AuthService } from '../../core/auth/auth.service';
import { MerchantApplication, PaginationMeta } from '../../core/models/application.model';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly appService = inject(ApplicationService);
  readonly auth = inject(AuthService);

  readonly applications = signal<MerchantApplication[]>([]);
  readonly pagination = signal<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly page = signal(1);
  readonly status = signal('ALL');
  readonly search = signal('');

  ngOnInit(): void {
    this.loadApplications();
  }

  loadApplications(): void {
    this.loading.set(true);
    this.error.set(null);

    this.appService
      .getApplications({
        page: this.page(),
        limit: 10,
        status: this.status(),
        search: this.search(),
      })
      .subscribe({
        next: (res) => {
          this.applications.set(res.data);
          this.pagination.set(res.pagination);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load applications. Please try again.');
          this.loading.set(false);
        },
      });
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.loadApplications();
  }

  onStatusChange(value: string): void {
    this.status.set(value);
    this.page.set(1);
    this.loadApplications();
  }

  changePage(newPage: number): void {
    this.page.set(newPage);
    this.loadApplications();
  }

  statusBadge(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'bg-secondary',
      SUBMITTED: 'bg-info text-dark',
      IN_REVIEW: 'bg-warning text-dark',
      CHANGES_REQUESTED: 'bg-warning text-dark',
      APPROVED: 'bg-success',
      REJECTED: 'bg-danger',
    };
    return map[status] || 'bg-secondary';
  }
}