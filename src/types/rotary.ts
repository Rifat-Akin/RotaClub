export type ClubRole = 'uye' | 'sekreter' | 'sayman' | 'baskan';

export type TabId = 'home' | 'operations' | 'finance' | 'projects' | 'directory';

export type RsvpStatus = 'attending' | 'with_spouse' | 'with_guest' | 'excused';

export type MenuPreference = 'Standart' | 'Vejetaryen' | 'Balık';

export interface MemberRsvp {
  memberId: string;
  memberName: string;
  status: RsvpStatus;
  menu: MenuPreference;
  guestCount: number;
  note?: string;
}

export interface RitualStep {
  id: string;
  time: string;
  title: string;
  responsible: string;
  completed: boolean;
}

export interface CelebrationItem {
  id: string;
  memberName: string;
  type: 'Doğum Günü' | 'Evlilik Yıldönümü' | 'Kulübe Katılım Yıldönümü';
  dateLabel: string;
  spouseName?: string;
  years?: number;
  congratulated: boolean;
}

export interface WeeklyMeeting {
  meetingNo: number;
  date: string;
  time: string;
  venue: string;
  hall: string;
  speakerName: string;
  speakerTitle: string;
  topic: string;
  speakerBio: string;
  certificateStatus: 'Hazır — İmzalandı' | 'PolioPlus Bağışı Bekleniyor' | 'Takdim Edildi';
  certificateDonationTree: string;
}

export interface MakeupSubmission {
  id: string;
  memberName: string;
  targetClubOrEvent: string;
  activityType: 'Kulüp Toplantısı' | 'Bölge Semineri' | 'Hizmet Projesi' | 'Komite Toplantısı';
  date: string;
  description: string;
  status: 'Onaylandı' | 'İnceleniyor';
  attendanceBoost: number;
}

export interface GuestRotaryMakeupCard {
  id: string;
  guestName: string;
  guestClub: string;
  guestDistrict: string;
  guestEmail: string;
  meetingNo: number;
  meetingDate: string;
  sentAt: string;
  verificationCode: string;
}

export interface FiresideGroup {
  id: string;
  groupName: string;
  hostMember: string;
  hostRole: string;
  date: string;
  time: string;
  location: string;
  addressDetail: string;
  topic: string;
  participants: string[];
  reportSubmitted: boolean;
  reportSummary?: string;
  attendanceRate?: string;
}

export interface FinancialLineItem {
  id: string;
  category: 'Dönem Aidatı' | 'Toplantı Kuver Bakiyesi' | 'Vakıf / Proje Katkı Payı';
  title: string;
  period: string;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
}

export interface PaymentNotification {
  id: string;
  memberId: string;
  memberName: string;
  category: 'Dönem Aidatı' | 'Toplantı Kuver Bakiyesi' | 'Vakıf / Proje Katkı Payı';
  amount: number;
  description: string;
  submittedAt: string;
  receiptRef: string;
  status: 'Bekliyor' | 'Onaylandı' | 'Reddedildi';
}

export interface OverdueMemberItem {
  id: string;
  memberName: string;
  classification: string;
  overdueAmount: number;
  overdueCategory: string;
  daysPastDue: number;
  lastRemindedAt?: string;
}

export interface GalleryArchivePhoto {
  id: string;
  title: string;
  caption: string;
  date: string;
  photographer: string;
  visualTheme: 'galatart' | 'concert' | 'school' | 'ryla' | 'gala';
}

export interface GalataProject {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  category: 'Kültür & Sanat' | 'Toplum Hizmetleri' | 'Gençlik & Liderlik' | 'Sağlık & Eğitim';
  dateLabel: string;
  venue: string;
  description: string;
  committeeChair: string;
  targetBudget: number;
  collectedAmount: number;
  supportersCount: number;
  ticketPrice: number;
  visualTheme: 'galatart' | 'concert' | 'school' | 'ryla';
  impactMetrics: string[];
}

export interface RotaryMember {
  id: string;
  rotaryId: string;
  fullName: string;
  clubTitle: string;
  classification: string;
  industryCategory: 'Yazılım & Teknoloji' | 'Deniz Hukuku' | 'Mimarlık' | 'Tekstil' | 'Finans' | 'Sağlık & Tıp' | 'Kültür & Sanat';
  companyName: string;
  position: string;
  bloodGroup: string;
  phfLevel: string;
  phfStars: number;
  joinYear: number;
  attendancePercent: number;
  email: string;
  phone: string;
  sponsorMember: string;
}

export interface TermBoardInfo {
  termLabel: string;
  district: string;
  themeTitle: string;
  president: string;
  secretary: string;
  treasurer: string;
  pastPresident: string;
  vicePresident: string;
  isRolloverCompleted: boolean;
  archivedYearbook?: {
    termLabel: string;
    president: string;
    totalProjects: number;
    totalDonationsTL: number;
    totalMeetings: number;
    averageAttendance: number;
    archivedAt: string;
  };
}
