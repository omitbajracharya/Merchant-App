import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApplicationDetailResponse,
  ApplicationDraftPayload,
  MerchantApplication,
  PaginatedApplicationsResponse,
  RevealFieldResponse,
  ReviewDecision,
  ReviewerOption,
  RiskReview,
  SensitiveFieldName,
} from '../models/application.model';

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/applications`;

  getApplications(params: {
    page: number;
    limit: number;
    status?: string;
    search?: string;
  }): Observable<PaginatedApplicationsResponse> {
    let httpParams = new HttpParams()
      .set('page', params.page)
      .set('limit', params.limit);

    if (params.status && params.status !== 'ALL') {
      httpParams = httpParams.set('status', params.status);
    }
    if (params.search?.trim()) {
      httpParams = httpParams.set('search', params.search.trim());
    }

    return this.http.get<PaginatedApplicationsResponse>(this.baseUrl, { params: httpParams });
  }

  getById(id: string): Observable<ApplicationDetailResponse> {
    return this.http.get<ApplicationDetailResponse>(`${this.baseUrl}/${id}`);
  }

  createDraft(business_name?: string): Observable<{ application: MerchantApplication }> {
    return this.http.post<{ application: MerchantApplication }>(this.baseUrl, { business_name });
  }

  saveDraft(id: string, payload: ApplicationDraftPayload): Observable<{ application: MerchantApplication }> {
    return this.http.patch<{ application: MerchantApplication }>(`${this.baseUrl}/${id}/draft`, payload);
  }

  submitApplication(id: string): Observable<{ application: MerchantApplication }> {
    return this.http.post<{ application: MerchantApplication }>(`${this.baseUrl}/${id}/submit`, {});
  }

  getReviewers(): Observable<{ reviewers: ReviewerOption[] }> {
    return this.http.get<{ reviewers: ReviewerOption[] }>(`${this.baseUrl}/reviewers`);
  }

  assignReviewer(id: string, reviewerId: string | null): Observable<{ application: MerchantApplication }> {
    return this.http.patch<{ application: MerchantApplication }>(`${this.baseUrl}/${id}/assign`, { reviewerId });
  }

  submitReview(
    id: string,
    payload: { decision: ReviewDecision; riskScore: number | null; notes: string }
  ): Observable<{ review: RiskReview }> {
    return this.http.post<{ review: RiskReview }>(`${this.baseUrl}/${id}/reviews`, payload);
  }

  revealSensitiveField(id: string, field: SensitiveFieldName): Observable<RevealFieldResponse> {
    return this.http.post<RevealFieldResponse>(`${this.baseUrl}/${id}/reveal`, { field });
  }
}