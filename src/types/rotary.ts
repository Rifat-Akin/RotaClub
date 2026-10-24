export type ClubRole = 'uye' | 'sekreter' | 'sayman' | 'baskan';

export type TabId = 'home' | 'operations' | 'finance' | 'projects' | 'directory';

export type RsvpStatus = 'attending' | 'with_spouse' | 'with_guest' | 'excused' | 'pending';

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
  isPast?: boolean;
  bulletinSummary?: string;
  attendanceCount?: number;
  highlights?: string[];
  status?: 'Planlandı' | 'Aktif' | 'Tamamlandı' | 'İptal Edildi';
  // Issue #29 & #42: Persisted Hotel Banquet Commitment & Official Confirmation Fields
  minHotelGuarantee?: number;
  unitKuverCostTL?: number;
  protocolSpeakerKuver?: number;
  isLcvLockedForHotel?: boolean;
  hotelConfirmationRef?: string;
  hotelConfirmedBy?: string;
  hotelConfirmedAt?: string;
}

export type MakeupStatus =
  | 'Taslak'
  | 'İnceleniyor'
  | 'Düzeltme İstendi'
  | 'Onaylandı'
  | 'Reddedildi'
  | 'İtiraz Edildi';

export interface MakeupAuditHistoryEntry {
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: ClubRole;
  fromStatus?: MakeupStatus;
  toStatus: MakeupStatus;
  note?: string;
}

export interface MakeupSubmission {
  id: string;
  memberId?: string;
  memberName: string;
  targetClubOrEvent: string;
  activityType:
    | 'Kulüp Toplantısı'
    | 'Bölge Semineri'
    | 'Hizmet Projesi'
    | 'Komite Toplantısı'
    | 'Kulüp Ziyareti';
  date: string;
  description: string;
  evidenceRef?: string;
  status: MakeupStatus;
  attendanceBoost: number;
  reviewerNote?: string;
  appealNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  auditTrail?: MakeupAuditHistoryEntry[];
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
  schemaVersion?: number;
  status?: 'Taslak' | 'Aktif' | 'İptal Edildi';
  issuedByMemberId?: string;
  issuedByName?: string;
  issuedByRole?: ClubRole;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}

export type ReminderChannel = 'E-Posta' | 'SMS' | 'WhatsApp Taslağı';

export type LcvReminderDeliveryStatus =
  | 'Taslak Kuyrukta (Dış Gönderim Kapalı)'
  | 'Atlandı (Opt-Out)'
  | 'Atlandı (Sessiz Saat 22:00-08:00)'
  | 'Atlandı (Mükerrer / Cooldown)'
  | 'Sağlayıcı Kanıtı ile İletildi';

export interface LcvReminderQueueItem {
  id: string;
  meetingNo: number;
  memberId: string;
  memberName: string;
  channel: ReminderChannel;
  draftMessage: string;
  status: LcvReminderDeliveryStatus;
  createdAt: string;
  createdAtEpochMs: number;
  createdBy: string;
  providerReceiptId?: string;
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
  idempotencyKey?: string;
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
  targetProjectId?: string;
  targetScholarId?: string;
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

export interface TreasuryLedgerEntry {
  id: string;
  date: string;
  type: 'Gelir' | 'Gider';
  category: 'Aidat & Kuver Tahsilatı' | 'Otel & Banket Gideri' | 'UR Bölge & Vakıf' | 'Burs & Proje Fonu' | 'Sponsorluk Geliri';
  title: string;
  amount: number;
  referenceNo: string;
  counterparty: string;
}

export interface ScholarStudent {
  id: string;
  fullName: string;
  university: string;
  department: string;
  gradeLevel: string;
  monthlyStipend: number;
  fundedMonths: number;
  totalMonths: number;
  mentorMember: string;
  statusNote: string;
}

export interface ClubCommittee {
  id: string;
  name: string;
  chairName: string;
  viceChairName: string;
  members: string[];
  termGoal: string;
  activeProjectsCount: number;
  budgetAllocated: number;
}

export interface PastPresidentRecord {
  id: string;
  termYears: string;
  presidentName: string;
  rotaryTheme: string;
  flagshipProject: string;
  phfHonors: string;
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
  volunteers?: string[];
}

export interface RotaryMember {
  id: string;
  rotaryId: string;
  fullName: string;
  clubTitle: string;
  classification: string;
  industryCategory:
    | 'Yazılım & Teknoloji'
    | 'Deniz Hukuku'
    | 'Mimarlık'
    | 'Tekstil'
    | 'Finans'
    | 'Sağlık & Tıp'
    | 'Kültür & Sanat';
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
  // v3.0 Enriched Member Fields
  spouseName?: string;
  birthday: string;
  weddingAnniversary?: string;
  sponsorName: string;
  committees: string[];
  duesBalance: number;
  mealBalance: number;
  foundationBalance: number;
  rsvpStatus: RsvpStatus;
  mealPreference: MenuPreference;
  guestName?: string;
  // Issue #32: Communication Preferences & Opt-Out
  reminderOptOut?: boolean;
  preferredReminderChannel?: ReminderChannel;
  lastRemindedMeetingNo?: number;
  lastRemindedAtIso?: string;
}

export type Member = RotaryMember;

export interface TermBoardInfo {
  clubName?: string;
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

export interface SpeakerProposal {
  id: string;
  speakerName: string;
  speakerTitle: string;
  proposedTopic: string;
  proposedBy: string;
  votes: number;
  hasVoted: boolean;
  targetMonth: string;
}

export interface TenantClubOption {
  id: string;
  name: string;
  district: string;
  status: 'Aktif' | 'Yakında' | 'Bölge Merkezi';
  membersCount: number;
  meetingDay: string;
}

export interface AuditLogEntry {
  id: string;
  sequenceNo?: number;
  clubId?: string;
  timestamp: string;
  actorName: string;
  actorRole: ClubRole;
  module:
    | 'LCV & Kuver'
    | 'QR Yoklama & Make-up'
    | 'Saymanlık & Kasa'
    | 'Projeler & Burslar'
    | 'Yönetim & Güvenlik';
  action: string;
  detail: string;
  verifiedByServer: boolean;
  prevHash?: string;
  entryHash?: string;
}

export interface BoardResolutionItem {
  id: string;
  resolutionNo: string;
  date: string;
  title: string;
  summary: string;
  voteStatus: 'Oybirliği ile Kabul' | 'Oyçokluğu ile Kabul';
  signedBy: string;
}



