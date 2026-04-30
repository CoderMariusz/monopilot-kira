// ============ My Account screens (regular user view) ============

const MyProfileScreen = () => (
  <>
    <PageHead title="My profile" sub="Your personal info — only visible to admins and you." />
    <Section title="Profile" foot={<><button className="btn btn-ghost">Cancel</button><button className="btn btn-primary">Save changes</button></>}>
      <SRow label="Avatar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, background: "#3b82f6", color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 20 }}>KN</div>
          <div>
            <button className="btn btn-secondary btn-sm">Upload</button>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>PNG or JPG · 200×200px</div>
          </div>
        </div>
      </SRow>
      <SRow label="Full name"><input type="text" defaultValue="Krzysztof Nowak" /></SRow>
      <SRow label="Display name" hint="Shown in the UI."><input type="text" defaultValue="K. Nowak" /></SRow>
      <SRow label="Email"><input type="email" defaultValue="k.nowak@apex.pl" disabled /></SRow>
      <SRow label="Phone"><input type="text" defaultValue="+48 600 123 456" /></SRow>
      <SRow label="Language">
        <select defaultValue="en">
          <option value="en">English</option><option>Polski</option><option>Deutsch</option>
        </select>
      </SRow>
      <SRow label="Timezone">
        <select defaultValue="Europe/Warsaw">
          <option>Europe/Warsaw</option><option>Europe/Berlin</option><option>Europe/London</option>
        </select>
      </SRow>
    </Section>

    <Section title="Password" foot={<button className="btn btn-primary">Update password</button>}>
      <SRow label="Current password"><input type="password" placeholder="••••••••" /></SRow>
      <SRow label="New password"><input type="password" placeholder="Min. 12 characters" /></SRow>
      <SRow label="Confirm new"><input type="password" /></SRow>
    </Section>

    <Section title="Two-factor authentication" action={<span className="badge badge-green">● Enabled</span>}>
      <SRow label="Authenticator app" hint="Google Authenticator on iPhone. Added 2025-07-14.">
        <button className="btn btn-secondary btn-sm">Reconfigure</button>
      </SRow>
      <SRow label="Backup codes" hint="Use these if you lose access to your authenticator.">
        <button className="btn btn-ghost btn-sm">Show codes</button>
      </SRow>
    </Section>

    <Section title="Active sessions">
      <table>
        <thead><tr><th></th><th>Device</th><th>Location</th><th>Last active</th><th></th></tr></thead>
        <tbody>
          <tr>
            <td style={{ width: 30 }}>💻</td>
            <td><div style={{ fontWeight: 500 }}>Chrome on macOS</div><div className="muted mono" style={{ fontSize: 11 }}>192.168.1.42</div></td>
            <td>Kraków, PL</td>
            <td><span className="badge badge-green">Current session</span></td>
            <td></td>
          </tr>
          <tr>
            <td>📱</td>
            <td><div style={{ fontWeight: 500 }}>Monopilot Scanner</div><div className="muted mono" style={{ fontSize: 11 }}>Zebra TC22 · DEV-001</div></td>
            <td>Kraków HQ · Line 1</td>
            <td className="mono">2 hours ago</td>
            <td><button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>Revoke</button></td>
          </tr>
        </tbody>
      </table>
    </Section>

    <Section title="Danger zone">
      <SRow label="Log out of all devices">
        <button className="btn btn-danger btn-sm">Log out everywhere</button>
      </SRow>
    </Section>
  </>
);

const MyNotificationsScreen = () => (
  <>
    <PageHead title="My notifications" sub="Choose which alerts reach you, and where." />

    <Section title="In-app">
      <SRow label="Show notification badges" hint="Red dot on sidebar modules with unread items.">
        <Toggle on={true} />
      </SRow>
      <SRow label="Desktop notifications" hint="Browser push notifications.">
        <Toggle on={true} />
      </SRow>
      <SRow label="Sound on alert">
        <Toggle on={false} />
      </SRow>
    </Section>

    <Section title="Email preferences">
      <SRow label="Work order assigned to me">
        <Toggle on={true} />
      </SRow>
      <SRow label="Approval requested">
        <Toggle on={true} />
      </SRow>
      <SRow label="Daily plant summary" hint="Sent at 18:00 every workday.">
        <Toggle on={true} />
      </SRow>
      <SRow label="Weekly NPD digest">
        <Toggle on={false} />
      </SRow>
      <SRow label="Product updates & tips" hint="From Monopilot.">
        <Toggle on={false} />
      </SRow>
    </Section>

    <Section title="Quiet hours" sub="Pause non-critical notifications during these times.">
      <SRow label="Enable quiet hours">
        <Toggle on={false} />
      </SRow>
      <SRow label="From / to">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="text" defaultValue="20:00" style={{ width: 80 }} />
          <span className="muted">→</span>
          <input type="text" defaultValue="07:00" style={{ width: 80 }} />
        </div>
      </SRow>
    </Section>
  </>
);

Object.assign(window, { MyProfileScreen, MyNotificationsScreen });
