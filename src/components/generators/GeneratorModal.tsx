import { useState, useEffect } from 'react';
import { X, Wand2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface GeneratorData {
  name: string;
  description: string;
  tags?: string[];
  [key: string]: any;
}

interface GeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  generatorPath: string;
  title: string;
  onImport: (data: GeneratorData) => void;
}

export function GeneratorModal({ 
  isOpen, 
  onClose, 
  generatorPath, 
  title, 
  onImport 
}: GeneratorModalProps) {
  const [generatedData, setGeneratedData] = useState<GeneratorData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock generator data - in a real app, this would load actual generator content
  const mockGenerators: Record<string, GeneratorData[]> = {
    '/generators/character-generator.html': [
      {
        name: 'Aldric the Brave',
        description: 'A noble warrior with a mysterious past, wielding an ancient sword passed down through generations.',
        tags: ['character', 'warrior', 'noble'],
        class: 'Warrior',
        race: 'Human',
        stats: { strength: 18, dexterity: 14, constitution: 16, intelligence: 12, wisdom: 14, charisma: 15 }
      },
      {
        name: 'Lyra Moonwhisper',
        description: 'An elven mage who studies the arcane arts under the light of the full moon.',
        tags: ['character', 'mage', 'elf'],
        class: 'Mage',
        race: 'Elf',
        stats: { strength: 8, dexterity: 16, constitution: 12, intelligence: 18, wisdom: 17, charisma: 14 }
      },
      {
        name: 'Grok Ironforge',
        description: 'A dwarven blacksmith of legendary skill, whose creations are sought across the realm.',
        tags: ['character', 'dwarf', 'craftsman'],
        class: 'Artificer',
        race: 'Dwarf',
        stats: { strength: 16, dexterity: 10, constitution: 18, intelligence: 14, wisdom: 12, charisma: 10 }
      }
    ],
    '/generators/city-generator.html': [
      {
        name: 'Silverport',
        description: 'A bustling coastal city known for its thriving trade routes and diverse population.',
        tags: ['city', 'coastal', 'trade'],
        population: 45000,
        type: 'Coastal Trade City',
        resources: ['fish', 'salt', 'timber', 'exotic goods']
      },
      {
        name: 'Stonehaven',
        description: 'An ancient mountain fortress city carved into the peaks, home to dwarven clans.',
        tags: ['city', 'mountain', 'fortress'],
        population: 12000,
        type: 'Mountain Fortress',
        resources: ['iron', 'gold', 'gems', 'stone']
      },
      {
        name: 'Whisperwind',
        description: 'A mystical desert oasis city that appears only during certain celestial alignments.',
        tags: ['city', 'desert', 'magical'],
        population: 3500,
        type: 'Magical Oasis',
        resources: ['water', 'rare herbs', 'magical crystals']
      }
    ],
    '/generators/god-generator.html': [
      {
        name: 'Solara, Dawn Bringer',
        description: 'Goddess of the sun, new beginnings, and hope. Her followers believe she brings light to darkness.',
        tags: ['god', 'sun', 'hope'],
        domain: ['Sun', 'Dawn', 'Hope'],
        alignment: 'Lawful Good',
        followers: 'Paladins, healers, those seeking redemption'
      },
      {
        name: 'Umbral, Shadow Weaver',
        description: 'God of shadows, secrets, and transitions. Neither good nor evil, but exists in balance.',
        tags: ['god', 'shadows', 'secrets'],
        domain: ['Shadows', 'Secrets', 'Transitions'],
        alignment: 'True Neutral',
        followers: 'Spies, scholars, those who walk between worlds'
      },
      {
        name: 'Kragoth, World Forge',
        description: 'Primordial god of creation, craftsmanship, and the eternal cycle of destruction and rebirth.',
        tags: ['god', 'creation', 'destruction'],
        domain: ['Creation', 'Craftsmanship', 'Cycles'],
        alignment: 'Neutral',
        followers: 'Artisans, builders, those who understand change'
      }
    ],
    '/generators/battle-generator.html': [
      {
        name: 'The Siege of Silverport',
        description: 'A desperate defense against overwhelming odds, where courage and strategy clash with brute force.',
        tags: ['battle', 'siege', 'defense'],
        type: 'Siege Battle',
        location: 'Silverport',
        participants: ['Silverport Defenders', 'Iron Legion'],
        outcome: 'Pyrrhic Victory'
      },
      {
        name: 'The Shadow War',
        description: 'A clandestine conflict fought in darkness between rival assassins guilds.',
        tags: ['battle', 'stealth', 'guild'],
        type: 'Guerrilla Warfare',
        location: 'Underground Tunnels',
        participants: ['Shadow Veil Guild', 'Silent Blade Order'],
        outcome: 'Stalemate'
      },
      {
        name: 'The Dragon\'s Last Stand',
        description: 'An epic confrontation where ancient dragon guardians face off against modern armies.',
        tags: ['battle', 'dragon', 'epic'],
        type: 'Mythic Battle',
        location: 'Dragon\'s Peak',
        participants: ['Ancient Dragons', 'United Kingdoms'],
        outcome: 'Divine Intervention'
      }
    ]
  };

  const generateNewData = () => {
    setIsLoading(true);
    setError(null);
    
    // Simulate API call
    setTimeout(() => {
      try {
        const generatorData = mockGenerators[generatorPath] || [];
        if (generatorData.length === 0) {
          throw new Error('Generator not found');
        }
        
        const randomData = generatorData[Math.floor(Math.random() * generatorData.length)];
        setGeneratedData(randomData);
        setIsLoading(false);
        toast.success('New content generated!');
      } catch (err) {
        setError('Failed to generate content');
        setIsLoading(false);
        toast.error('Failed to generate content');
      }
    }, 1500);
  };

  const handleImport = () => {
    if (generatedData) {
      onImport(generatedData);
      onClose();
      toast.success('Content imported successfully!');
    }
  };

  // Generate initial data when modal opens
  useEffect(() => {
    if (isOpen && !generatedData) {
      generateNewData();
    }
  }, [isOpen, generatorPath]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setGeneratedData(null);
      setError(null);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl glass cosmic-glow border-glass-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-primary mb-4" />
              <div className="text-lg font-medium">Generating content...</div>
              <div className="text-sm text-muted-foreground">Consulting the cosmic energies...</div>
            </div>
          )}
          
          {error && (
            <div className="text-center py-12">
              <div className="text-lg font-medium text-destructive mb-2">Generation Failed</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button onClick={generateNewData} className="mt-4">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}
          
          {generatedData && !isLoading && (
            <div className="space-y-4">
              <Card className="glass cosmic-glow border-glass-border/40">
                <CardHeader>
                  <CardTitle className="text-lg">{generatedData.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="font-medium mb-2">Description</div>
                    <div className="text-sm text-muted-foreground">
                      {generatedData.description}
                    </div>
                  </div>
                  
                  {generatedData.tags && (
                    <div>
                      <div className="font-medium mb-2">Tags</div>
                      <div className="flex flex-wrap gap-2">
                        {generatedData.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-primary/20 text-primary text-xs rounded-full border border-primary/30"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Additional properties based on generator type */}
                  {Object.entries(generatedData)
                    .filter(([key]) => !['name', 'description', 'tags'].includes(key))
                    .map(([key, value]) => (
                      <div key={key}>
                        <div className="font-medium mb-2 capitalize">
                          {key.replace(/_/g, ' ')}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {typeof value === 'object' 
                            ? JSON.stringify(value, null, 2)
                            : String(value)
                          }
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
              
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={generateNewData} className="flex-1">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate New
                </Button>
                <Button onClick={handleImport} className="flex-1">
                  <Wand2 className="w-4 h-4 mr-2" />
                  Import to Workspace
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
