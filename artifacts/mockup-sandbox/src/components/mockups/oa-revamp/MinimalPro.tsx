import React, { useEffect } from 'react';
import './_minimalpro.css';
import { 
  ChevronDown, 
  Menu, 
  Moon, 
  Sun, 
  Trophy, 
  Users, 
  Clock, 
  Swords,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Settings,
  FileText,
  MessageSquare,
  Shield,
  Activity,
  Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const Header = () => (
  <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div className="container flex h-14 items-center justify-between px-4 max-w-[1280px] mx-auto">
      <div className="flex items-center gap-4">
        <a href="#" className="flex items-center gap-2">
          <img src="/__mockup/images/oa-logo.png" alt="OCE Inhouse" className="h-6 w-6" />
          <span className="font-semibold tracking-tight text-sm">
            <span className="font-bold">OCE</span> <span className="font-medium text-muted-foreground">Inhouse</span>
          </span>
        </a>
      </div>
      
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
        <a href="#" className="transition-colors hover:text-foreground/80">Home</a>
        <a href="#" className="transition-colors hover:text-foreground/80 text-foreground/60">Matches</a>
        <a href="#" className="transition-colors hover:text-foreground/80 text-foreground/60">Leaderboard</a>
        <a href="#" className="transition-colors hover:text-foreground/80 text-foreground/60">Heroes</a>
        <button className="flex items-center gap-1 transition-colors hover:text-foreground/80 text-foreground/60">
          Tools <ChevronDown className="h-3 w-3" />
        </button>
        <a href="#" className="transition-colors hover:text-foreground/80 text-foreground/60">Tournaments</a>
        <a href="#" className="transition-colors hover:text-foreground/80 text-foreground/60">Schedule</a>
      </nav>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" className="hidden lg:flex items-center gap-2 h-8 px-2 text-xs text-muted-foreground hover:text-foreground border border-border">
          Season 10 <ChevronDown className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Sun className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 pl-2 border-l border-border cursor-pointer hover:bg-muted/50 py-1 px-2 rounded-sm transition-colors">
          <Avatar className="h-6 w-6 rounded-none">
            <AvatarImage src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie" />
            <AvatarFallback>CK</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-xs font-medium leading-none">u/cookie</span>
            <span className="text-[10px] text-muted-foreground leading-none mt-0.5">7240 MMR</span>
          </div>
        </div>
      </div>
    </div>
  </header>
);

const Hero = () => (
  <section className="relative overflow-hidden border-b border-border minimal-pro-pattern bg-background/50">
    <div className="container relative z-10 py-24 md:py-32 px-4 max-w-[1280px] mx-auto text-center md:text-left flex flex-col items-center md:items-start">
      <Badge variant="outline" className="mb-4 text-xs font-medium bg-background">Season 10 is live</Badge>
      <h1 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4 max-w-3xl">
        Track every inhouse.<br />Climb the OCE ladder.
      </h1>
      <p className="text-muted-foreground text-lg md:text-xl mb-8 max-w-2xl">
        The premier Dota 2 inhouse league dashboard for the Australian and New Zealand community.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Button size="lg" className="font-medium bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/90 text-white rounded-none">
          View leaderboard
        </Button>
        <Button size="lg" variant="outline" className="font-medium rounded-none">
          Join the league
        </Button>
      </div>
    </div>
  </section>
);

const QuickStats = () => (
  <section className="border-b border-border bg-muted/20">
    <div className="container px-4 py-8 max-w-[1280px] mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
        <div className="flex flex-col space-y-1 p-4 border border-border bg-background">
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Swords className="h-4 w-4" /> Matches played
          </span>
          <span className="text-3xl font-bold tracking-tight">1,284</span>
        </div>
        <div className="flex flex-col space-y-1 p-4 border border-border bg-background">
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" /> Active players
          </span>
          <span className="text-3xl font-bold tracking-tight">87</span>
        </div>
        <div className="flex flex-col space-y-1 p-4 border border-border bg-background">
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" /> Hours of dota
          </span>
          <span className="text-3xl font-bold tracking-tight">3,640</span>
        </div>
        <div className="flex flex-col space-y-1 p-4 border border-border bg-background">
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Top hero last week
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">Pudge</span>
            <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-700 hover:bg-green-500/20 border-none rounded-none">64% WR</Badge>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const MatchesList = () => {
  const matches = [
    { id: '45892', result: 'Radiant', score: '38 - 42', duration: '42:15', mvp: 'SlickPlay', time: '2h ago', radiant: true },
    { id: '45891', result: 'Dire', score: '21 - 45', duration: '31:20', mvp: 'MidOrMeepo', time: '4h ago', radiant: false },
    { id: '45890', result: 'Radiant', score: '55 - 48', duration: '58:10', mvp: 'SupportGod', time: '6h ago', radiant: true },
    { id: '45889', result: 'Radiant', score: '30 - 15', duration: '25:45', mvp: 'CarryDiff', time: '8h ago', radiant: true },
    { id: '45888', result: 'Dire', score: '40 - 41', duration: '48:30', mvp: 'OfflaneChad', time: '12h ago', radiant: false },
  ];

  return (
    <Card className="rounded-none border-border shadow-none h-full">
      <CardHeader className="p-4 border-b border-border bg-muted/10">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Latest Matches</CardTitle>
          <Button variant="ghost" size="sm" className="h-8 text-xs">View all</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3 sm:p-4 hover:bg-muted/50 transition-colors cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Match {m.id}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 ${m.radiant ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm font-medium">{m.result} Win</span>
                  </div>
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-center min-w-[80px]">
                <span className="text-sm font-bold tracking-tighter">{m.score}</span>
                <span className="text-xs text-muted-foreground">{m.duration}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-sm">MVP: <span className="font-medium text-[hsl(var(--accent))]">{m.mvp}</span></span>
                <span className="text-xs text-muted-foreground mt-1">{m.time}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const LeaderboardPreview = () => {
  const players = [
    { rank: 1, name: 'SlickPlay', mmr: 8120, wl: '45W - 12L', winrate: 78, tier: 'Immortal', trend: 'up' },
    { rank: 2, name: 'MidOrMeepo', mmr: 7950, wl: '41W - 22L', winrate: 65, tier: 'Immortal', trend: 'up' },
    { rank: 3, name: 'SupportGod', mmr: 7800, wl: '38W - 20L', winrate: 65, tier: 'Immortal', trend: 'same' },
    { rank: 4, name: 'CarryDiff', mmr: 7650, wl: '35W - 25L', winrate: 58, tier: 'Divine', trend: 'down' },
    { rank: 5, name: 'OfflaneChad', mmr: 7500, wl: '32W - 21L', winrate: 60, tier: 'Divine', trend: 'up' },
  ];

  return (
    <Card className="rounded-none border-border shadow-none h-full">
      <CardHeader className="p-4 border-b border-border bg-muted/10">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Live Leaderboard</CardTitle>
          <Button variant="ghost" size="sm" className="h-8 text-xs">Full ranking</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground bg-muted/30 border-b border-border">
            <tr>
              <th className="px-4 py-2 font-medium w-12">#</th>
              <th className="px-4 py-2 font-medium">Player</th>
              <th className="px-4 py-2 font-medium text-right">MMR</th>
              <th className="px-4 py-2 font-medium text-right hidden sm:table-cell">Record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {players.map((p) => (
              <tr key={p.rank} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 font-medium text-muted-foreground">{p.rank}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30 text-muted-foreground rounded-none">{p.tier}</Badge>
                    <span className="font-medium">{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-mono font-medium">{p.mmr}</span>
                    {p.trend === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
                    {p.trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                    {p.trend === 'same' && <span className="text-muted-foreground">-</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                  {p.wl}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

const AdminPreview = () => (
  <section className="border-t border-border pt-16 pb-24">
    <div className="container px-4 max-w-[1280px] mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-1">Admin Panel — new layout</h2>
          <p className="text-sm text-muted-foreground">Preview of the upcoming sidebar-driven settings layout.</p>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row border border-border bg-background min-h-[600px] shadow-sm">
        {/* Sidebar */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-muted/10 p-4">
          <div className="flex items-center gap-2 mb-6 px-2">
            <Shield className="h-4 w-4 text-[hsl(var(--accent))]" />
            <span className="font-semibold text-sm">League Admin</span>
          </div>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Match Data</h3>
              <ul className="space-y-1">
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Record Match</a></li>
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Replays</a></li>
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Match List</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Players</h3>
              <ul className="space-y-1">
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Roster</a></li>
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Nicknames</a></li>
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Bans</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Seasons</h3>
              <ul className="space-y-1">
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Settings</a></li>
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Patch Notes</a></li>
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] font-medium rounded-sm transition-colors">Welcome Modal</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">System</h3>
              <ul className="space-y-1">
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Feature Flags</a></li>
                <li><a href="#" className="flex items-center text-sm px-2 py-1.5 text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors">Audit Log</a></li>
              </ul>
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col xl:flex-row">
          <div className="flex-1 p-6 md:p-8 border-b xl:border-b-0 xl:border-r border-border overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome Modal</h1>
                <p className="text-sm text-muted-foreground">Configure the popup shown to users on their first visit.</p>
              </div>
              <Button size="sm" className="rounded-none bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/90 text-white">Save Changes</Button>
            </div>
            
            <div className="space-y-6 max-w-xl">
              <div className="flex items-center justify-between p-4 border border-border bg-muted/20">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable Modal</Label>
                  <p className="text-xs text-muted-foreground">Toggle whether the welcome modal is active for users.</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="version">Version Key</Label>
                <Input id="version" defaultValue="v10_welcome" className="rounded-none border-border focus-visible:ring-[hsl(var(--accent))]" />
                <p className="text-xs text-muted-foreground">Change this to force the modal to show again for returning users.</p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="eyebrow">Eyebrow Text</Label>
                <Input id="eyebrow" defaultValue="Season 10 Update" className="rounded-none border-border focus-visible:ring-[hsl(var(--accent))]" />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" defaultValue="Welcome to the new OCE Inhouse" className="rounded-none border-border focus-visible:ring-[hsl(var(--accent))]" />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="body">Body Content</Label>
                <Textarea id="body" className="min-h-[120px] rounded-none border-border focus-visible:ring-[hsl(var(--accent))]" defaultValue="We've completely revamped the tracking platform for Season 10. MMR is reset, new badges are live, and the prize pool is bigger than ever. Read the full patch notes to see what's changed." />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cta-text">CTA Text</Label>
                  <Input id="cta-text" defaultValue="Read Patch Notes" className="rounded-none border-border focus-visible:ring-[hsl(var(--accent))]" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cta-href">CTA Link</Label>
                  <Input id="cta-href" defaultValue="/patch-notes" className="rounded-none border-border focus-visible:ring-[hsl(var(--accent))]" />
                </div>
              </div>
            </div>
          </div>
          
          {/* Live Preview Pane */}
          <div className="w-full xl:w-[400px] p-6 bg-muted/5 flex flex-col">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
              <Activity className="h-4 w-4" /> Live Preview
            </h3>
            
            <div className="flex-1 flex items-center justify-center p-4 border border-dashed border-border bg-muted/20">
              <Card className="w-full max-w-sm rounded-none border-border shadow-lg">
                <CardHeader className="pb-4">
                  <Badge variant="secondary" className="w-fit mb-2 text-[10px] rounded-none bg-muted font-medium">Season 10 Update</Badge>
                  <CardTitle className="text-xl leading-tight">Welcome to the new OCE Inhouse</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    We've completely revamped the tracking platform for Season 10. MMR is reset, new badges are live, and the prize pool is bigger than ever. Read the full patch notes to see what's changed.
                  </p>
                  <div className="flex flex-col gap-2 pt-2">
                    <Button className="w-full rounded-none bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/90 text-white">Read Patch Notes</Button>
                    <Button variant="ghost" className="w-full rounded-none text-muted-foreground">Dismiss</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="border-t border-border py-8 bg-background">
    <div className="container px-4 max-w-[1280px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2 opacity-60">
        <img src="/__mockup/images/oa-logo.png" alt="OCE Inhouse" className="h-4 w-4 grayscale" />
        <span className="text-xs font-medium">© {new Date().getFullYear()} OCE Inhouse</span>
      </div>
      
      <div className="flex items-center gap-6">
        <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Discord</a>
        <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">GitHub</a>
        <span className="text-xs text-muted-foreground border-l border-border pl-6">v5.59 — patch notes</span>
      </div>
    </div>
  </footer>
);

export function MinimalPro() {
  useEffect(() => {
    document.body.classList.add('minimal-pro');
    return () => {
      document.body.classList.remove('minimal-pro');
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-[hsl(var(--accent))]/30 font-sans">
      <Header />
      <main>
        <Hero />
        <QuickStats />
        <section className="container px-4 py-12 max-w-[1280px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <MatchesList />
            <LeaderboardPreview />
          </div>
        </section>
        <AdminPreview />
      </main>
      <Footer />
    </div>
  );
}
