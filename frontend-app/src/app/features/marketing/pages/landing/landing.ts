import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

/**
 * Trang chủ công khai (landing page) — điểm vào cho khách chưa đăng nhập.
 * Nội dung là copy giới thiệu + dữ liệu minh hoạ tĩnh, không gọi API,
 * để trang mở được ngay cả khi backend chưa chạy.
 */
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <header class="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a routerLink="/" class="flex shrink-0 items-center gap-2">
          <span
            class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25"
          >
            <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5" aria-hidden="true">
              <path
                d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5v-10Z"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
              <path
                d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5v-10Z"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="whitespace-nowrap text-lg font-semibold tracking-tight text-slate-900">
            Learning Hub
          </span>
        </a>

        <nav class="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#tinh-nang" class="transition hover:text-indigo-600">Tính năng</a>
          <a href="#mon-hoc" class="transition hover:text-indigo-600">Môn học</a>
          <a href="#cach-hoat-dong" class="transition hover:text-indigo-600">Cách hoạt động</a>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          @if (auth.isAuthenticated()) {
            <a
              [routerLink]="auth.isAdmin() ? '/admin/dashboard' : '/dashboard'"
              class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Vào ứng dụng
            </a>
          } @else {
            <a
              routerLink="/auth/login"
              class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Đăng nhập
            </a>
            <a
              routerLink="/auth/register"
              class="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Bắt đầu
            </a>
          }
        </div>
      </div>
    </header>

    <main>
      <!-- Hero -->
      <section class="relative overflow-hidden">
        <div class="landing-glow pointer-events-none absolute inset-0 -z-10" aria-hidden="true"></div>

        <div class="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div class="animate-fade-up">
            <span
              class="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-indigo-700"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
              Dành cho sinh viên — miễn phí
            </span>

            <h1
              class="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl"
            >
              Tài liệu học tập,
              <span class="landing-gradient-text">gom gọn một chỗ.</span>
            </h1>

            <p class="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Nơi sinh viên chia sẻ bài giảng, đề cương và đề thi đã qua kiểm duyệt. Tìm đúng môn,
              mở đúng file, không lạc giữa hàng trăm link rời rạc.
            </p>

            <div class="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                routerLink="/auth/register"
                class="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-600/30"
              >
                Tạo tài khoản
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
                  <path
                    fill-rule="evenodd"
                    d="M3 10a.75.75 0 0 1 .75-.75h10.6L10.2 5.1a.75.75 0 1 1 1.05-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 0 1-1.05-1.06l4.15-4.15H3.75A.75.75 0 0 1 3 10Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </a>
              <a
                routerLink="/auth/login"
                class="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                Tôi đã có tài khoản
              </a>
            </div>

            <dl class="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-500">
              <div class="flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-emerald-500">
                  <path
                    fill-rule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clip-rule="evenodd"
                  />
                </svg>
                Miễn phí
              </div>
              <div class="flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-emerald-500">
                  <path
                    fill-rule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clip-rule="evenodd"
                  />
                </svg>
                Xác thực email
              </div>
              <div class="flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-emerald-500">
                  <path
                    fill-rule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clip-rule="evenodd"
                  />
                </svg>
                Duyệt trước khi đăng
              </div>
            </dl>
          </div>

          <!-- Bản xem trước giao diện -->
          <div class="relative">
            <div
              class="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-indigo-200/70 via-violet-200/50 to-transparent blur-2xl"
              aria-hidden="true"
            ></div>

            <div
              class="animate-floaty rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur"
            >
              <div class="flex items-center gap-1.5 border-b border-slate-100 pb-3">
                <span class="h-2.5 w-2.5 rounded-full bg-rose-300"></span>
                <span class="h-2.5 w-2.5 rounded-full bg-amber-300"></span>
                <span class="h-2.5 w-2.5 rounded-full bg-emerald-300"></span>
                <span class="ml-2 truncate text-xs text-slate-400">learning-hub / tài liệu</span>
              </div>

              <div class="mt-3 space-y-2">
                @for (doc of sampleDocuments; track doc.title) {
                  <div
                    class="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-indigo-200 hover:shadow-sm"
                  >
                    <span
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[10px] font-bold text-indigo-600"
                    >
                      {{ doc.type }}
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-slate-800">{{ doc.title }}</p>
                      <p class="truncate text-xs text-slate-400">{{ doc.subject }}</p>
                    </div>
                    <span
                      class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                    >
                      Đã duyệt
                    </span>
                  </div>
                }
              </div>

              <div class="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span class="text-xs text-slate-500">Lọc theo môn · loại file · lượt xem</span>
                <span class="text-xs font-semibold text-indigo-600">3 kết quả</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Số liệu -->
      <section class="border-y border-slate-200 bg-white">
        <dl
          class="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4 md:py-10"
        >
          @for (stat of stats; track stat.label) {
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">
                {{ stat.label }}
              </dt>
              <dd class="mt-1 text-2xl font-bold tracking-tight text-slate-900">{{ stat.value }}</dd>
            </div>
          }
        </dl>
      </section>

      <!-- Tính năng -->
      <section id="tinh-nang" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
        <div class="max-w-2xl">
          <p class="text-sm font-semibold text-indigo-600">Tính năng</p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Đủ thứ để việc học bớt lộn xộn
          </h2>
          <p class="mt-3 text-slate-600">
            Tập trung vào đúng ba việc: tìm được tài liệu, biết tài liệu đáng tin, và chia sẻ lại dễ
            dàng.
          </p>
        </div>

        <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article
            class="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
          >
            <span
              class="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"
            >
              <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5" aria-hidden="true">
                <path
                  d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <h3 class="mt-4 text-base font-semibold text-slate-900">
              Tìm kiếm và lọc nhiều lựa chọn
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-slate-600">
              Lọc cùng lúc theo môn học, người đăng, loại file và lượt đánh giá. Bộ lọc được giữ
              trên URL nên gửi cho bạn cùng lớp là mở ra đúng kết quả đó.
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              @for (chip of filterChips; track chip) {
                <span
                  class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
                >
                  {{ chip }}
                </span>
              }
            </div>
          </article>

          @for (feature of features; track feature.title) {
            <article
              class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <span
                class="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700"
              >
                <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5" aria-hidden="true">
                  <path
                    [attr.d]="feature.icon"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <h3 class="mt-4 text-base font-semibold text-slate-900">{{ feature.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ feature.description }}</p>
            </article>
          }
        </div>
      </section>

      <!-- Môn học -->
      <section id="mon-hoc" class="scroll-mt-20 border-y border-slate-200 bg-white">
        <div class="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div class="max-w-2xl">
              <p class="text-sm font-semibold text-indigo-600">Môn học</p>
              <h2 class="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Bắt đầu từ môn bạn đang học
              </h2>
              <p class="mt-3 text-slate-600">
                Mỗi tài liệu thuộc đúng một môn, nên không phải đoán xem file này dùng cho kỳ nào.
              </p>
            </div>
            <a
              routerLink="/documents"
              class="text-sm font-semibold text-indigo-600 transition hover:text-indigo-700"
            >
              Xem toàn bộ tài liệu →
            </a>
          </div>

          <div class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (subject of subjects; track subject.code) {
              <a
                routerLink="/documents"
                class="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div class="min-w-0">
                  <p class="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                    {{ subject.code }}
                  </p>
                  <p class="mt-0.5 truncate text-sm font-medium text-slate-800">
                    {{ subject.name }}
                  </p>
                </div>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M3 10a.75.75 0 0 1 .75-.75h10.6L10.2 5.1a.75.75 0 1 1 1.05-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 0 1-1.05-1.06l4.15-4.15H3.75A.75.75 0 0 1 3 10Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </a>
            }
          </div>
        </div>
      </section>

      <!-- Cách hoạt động -->
      <section id="cach-hoat-dong" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
        <div class="max-w-2xl">
          <p class="text-sm font-semibold text-indigo-600">Cách hoạt động</p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Ba bước, không có bước thứ tư
          </h2>
        </div>

        <ol class="mt-10 grid gap-6 md:grid-cols-3">
          @for (step of steps; track step.title; let i = $index) {
            <li class="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span
                class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/25"
              >
                {{ i + 1 }}
              </span>
              <h3 class="mt-4 text-base font-semibold text-slate-900">{{ step.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ step.description }}</p>
            </li>
          }
        </ol>
      </section>

      <!-- CTA -->
      <section class="px-4 pb-20 sm:px-6">
        <div
          class="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 px-6 py-14 text-center shadow-2xl shadow-indigo-600/25 sm:px-12"
        >
          <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Kỳ này bạn có tài liệu gì để chia sẻ?
          </h2>
          <p class="mx-auto mt-3 max-w-xl text-indigo-100">
            Đăng ký bằng email, xác thực một lần, rồi đăng tài liệu đầu tiên. Tài liệu sẽ hiển thị
            cho mọi người ngay sau khi được duyệt.
          </p>
          <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              routerLink="/auth/register"
              class="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-indigo-700 shadow-lg shadow-indigo-900/20 transition hover:-translate-y-0.5 hover:bg-indigo-50"
            >
              Tạo tài khoản miễn phí
            </a>
            <a
              routerLink="/auth/login"
              class="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Đăng nhập
            </a>
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-slate-200 bg-white">
      <div
        class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <p class="flex items-center gap-2 text-base font-semibold text-slate-900">
            <span
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white"
            >
              LH
            </span>
            Learning Hub
          </p>
          <p class="mt-2 max-w-sm text-sm text-slate-500">
            Nền tảng chia sẻ tài liệu học tập giữa sinh viên — tài liệu được kiểm duyệt trước khi
            đăng.
          </p>
        </div>

        <nav class="flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-600">
          <a routerLink="/auth/register" class="transition hover:text-indigo-600">Đăng ký</a>
          <a routerLink="/auth/login" class="transition hover:text-indigo-600">Đăng nhập</a>
          <a routerLink="/documents" class="transition hover:text-indigo-600">Tài liệu</a>
        </nav>
      </div>

      <div class="border-t border-slate-100 py-4">
        <p class="mx-auto max-w-6xl px-4 text-xs text-slate-400 sm:px-6">
          © {{ year }} Learning Hub · Dự án học tập
        </p>
      </div>
    </footer>
  `,
})
export class Landing {
  protected readonly auth = inject(AuthService);
  protected readonly year = new Date().getFullYear();

  protected readonly sampleDocuments = [
    { type: 'PDF', title: 'Đề cương ôn tập Giải tích 1', subject: 'MAT1203 · Giải tích 1' },
    {
      type: 'DOCX',
      title: 'Slide OOP: kế thừa và đa hình',
      subject: 'INT2204 · Lập trình hướng đối tượng',
    },
    { type: 'PPTX', title: 'Đề thi giữa kỳ CNPM 2024', subject: 'INT2208 · Công nghệ phần mềm' },
  ];

  protected readonly stats = [
    { label: 'Chi phí', value: '0đ' },
    { label: 'Dung lượng mỗi file', value: '20 MB' },
    { label: 'Duyệt trước khi đăng', value: '100%' },
    { label: 'Lượt xem', value: '1/ngày' },
  ];

  protected readonly filterChips = [
    'Giải tích 1',
    'Công nghệ phần mềm',
    'PDF',
    'Mới nhất',
    'Nhiều lượt xem',
  ];

  protected readonly features = [
    {
      title: 'Kiểm duyệt trước khi đăng',
      description:
        'Quản trị viên duyệt từng tài liệu; bài bị từ chối luôn kèm lý do để người đăng sửa lại.',
      icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    },
    {
      title: 'Đếm lượt xem công bằng',
      description:
        'Mỗi người chỉ được tính một lượt xem mỗi ngày, nên con số phản ánh đúng mức độ hữu ích.',
      icon: 'M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12Zm9.75 2.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z',
    },
    {
      title: 'Đăng tài liệu nhanh',
      description: 'Chọn file PDF, DOCX hoặc PPTX tối đa 20 MB, chọn môn, viết mô tả, gửi duyệt.',
      icon: 'M12 16.5V3m0 0L7.5 7.5M12 3l4.5 4.5M4.5 15v3.75A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25V15',
    },
    {
      title: 'Hồ sơ sinh viên',
      description:
        'Ảnh đại diện, mã số sinh viên và tên hiển thị — người đọc biết tài liệu đến từ ai.',
      icon: 'M15.75 6.75a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.1a7.5 7.5 0 0 1 15 0',
    },
    {
      title: 'Sắp có: đánh giá và xếp hạng',
      description:
        'Chấm sao, thông báo khi bài được duyệt, level/EXP và bảng xếp hạng theo đóng góp.',
      icon: 'm12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8L12 3Z',
    },
  ];

  protected readonly subjects = [
    { code: 'MAT1203', name: 'Giải tích 1' },
    { code: 'MAT1093', name: 'Đại số tuyến tính' },
    { code: 'INT2204', name: 'Lập trình hướng đối tượng' },
    { code: 'INT2208', name: 'Công nghệ phần mềm' },
    { code: 'PHY1100', name: 'Vật lý đại cương 1' },
  ];

  protected readonly steps = [
    {
      title: 'Đăng ký và xác thực email',
      description: 'Tạo tài khoản bằng email, mở link xác thực trong hộp thư là dùng được ngay.',
    },
    {
      title: 'Đăng tài liệu, chờ duyệt',
      description:
        'Tải file lên, chọn đúng môn và mô tả ngắn. Quản trị viên duyệt rồi tài liệu mới hiển thị.',
    },
    {
      title: 'Tìm lại khi cần',
      description: 'Lọc theo môn hay từ khoá, mở chi tiết và tải file về máy của bạn.',
    },
  ];
}
