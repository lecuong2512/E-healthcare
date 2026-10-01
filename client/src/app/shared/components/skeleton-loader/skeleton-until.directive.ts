import {
  Directive,
  EmbeddedViewRef,
  Input,
  OnChanges,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';

/**
 * *appSkeletonUntil="isLoading; skeleton: skeletonTpl"
 *
 * Đảm bảo NFR-UX-03: khi `condition` = true (đang loading), skeleton phải
 * render NGAY (0ms) — không debounce/delay — "không để màn hình trống quá
 * 300ms" nghĩa là skeleton phải xuất hiện TRƯỚC mốc đó.
 *
 * Ví dụ dùng ở SRS-PAT-01 (danh sách bác sĩ):
 * <ng-container *appSkeletonUntil="loading(); skeleton: doctorListSkeleton">
 *   <app-doctor-card *ngFor="let d of doctors()" [doctor]="d" />
 * </ng-container>
 * <ng-template #doctorListSkeleton>
 *   <app-skeleton-loader shape="card" *ngFor="let i of [1,2,3]" />
 * </ng-template>
 */
@Directive({
  selector: '[appSkeletonUntil]',
  standalone: true,
})
export class SkeletonUntilDirective implements OnChanges, OnDestroy {
  @Input('appSkeletonUntil') condition = false;
  @Input('appSkeletonUntilSkeleton') skeletonTpl?: TemplateRef<unknown>;

  private contentView?: EmbeddedViewRef<unknown>;
  private skeletonView?: EmbeddedViewRef<unknown>;

  constructor(private readonly contentTpl: TemplateRef<unknown>, private readonly vcr: ViewContainerRef) {}

  ngOnChanges(): void {
    this.vcr.clear();
    if (this.condition && this.skeletonTpl) {
      this.skeletonView = this.vcr.createEmbeddedView(this.skeletonTpl);
    } else {
      this.contentView = this.vcr.createEmbeddedView(this.contentTpl);
    }
  }

  ngOnDestroy(): void {
    this.contentView?.destroy();
    this.skeletonView?.destroy();
  }
}
