import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

function ScreenDesigner() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-on-surface">Screen Designer</h2>
        <p className="text-on-surface-variant">Design the welcome screen experience</p>
      </header>
      
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Canvas Area */}
        <Card className="flex-1">
          <CardHeader className="border-b border-surface-container-high bg-surface-container-low flex flex-row items-center justify-between">
            <CardTitle className="text-lg">📱 Canvas</CardTitle>
            <Button size="sm">Save Layout</Button>
          </CardHeader>
          <CardContent className="p-6">
            <div className="bg-surface border-2 border-dashed border-outline-variant rounded-lg p-4 min-h-[400px] flex items-center justify-center relative">
              <div className="absolute top-4 left-4 text-on-surface-variant text-sm font-mono">Preview (1920x1080)</div>
              
              {/* Mock Template */}
              <div className="w-3/4 h-3/4 bg-surface-container-lowest rounded-lg shadow-md flex flex-col items-center justify-center p-8 text-center space-y-4">
                <h1 className="text-3xl font-bold text-on-surface">Welcome, {`{GUEST_FIRST_NAME}`} ✨</h1>
                <p className="text-lg text-on-surface-variant">Room {`{ROOM_NUMBER}`} • We're glad you're here.</p>
                <div className="mt-8 px-6 py-2 bg-primary/20 text-primary rounded-full text-sm font-bold tracking-widest uppercase">
                  Press OK to Start
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Properties Panel */}
        <Card className="w-full lg:w-80">
          <CardHeader className="border-b border-surface-container-high bg-surface-container-low">
            <CardTitle className="text-lg">Properties</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold tracking-wide text-on-surface uppercase">Layout Type</label>
              <select className="w-full bg-surface-container border border-outline-variant rounded p-2 text-sm text-on-surface focus:outline-none focus:border-primary">
                <option>Default Center</option>
                <option>Split Screen</option>
                <option>Video Background</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold tracking-wide text-on-surface uppercase">Background Image</label>
              <input type="file" className="w-full text-sm text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-container file:text-on-primary-container hover:file:bg-primary/20"/>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold tracking-wide text-on-surface uppercase">Dynamic Variables</label>
              <div className="flex flex-wrap gap-2">
                <Badge className="cursor-pointer font-mono hover:bg-primary hover:text-primary-container">{`{GUEST_NAME}`}</Badge>
                <Badge className="cursor-pointer font-mono hover:bg-primary hover:text-primary-container">{`{ROOM_NUMBER}`}</Badge>
                <Badge className="cursor-pointer font-mono hover:bg-primary hover:text-primary-container">{`{WEATHER}`}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ScreenDesigner;
