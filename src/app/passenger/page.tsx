import { RideDiscovery } from "@/components/passenger/ride-discovery";

export default function PassengerHome() {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-teal-800">Passenger workspace</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Find your next ride</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Discover verified drivers nearby and browse upcoming shared rides in Embu County.
        </p>
      </section>
      <RideDiscovery />
    </div>
  );
}
