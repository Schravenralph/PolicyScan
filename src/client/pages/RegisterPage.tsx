import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Mail, Lock, User, Briefcase, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { t } from '../utils/i18n';
import { Button } from '../components/ui/button';

export function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState('advisor');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const getPasswordStrength = (pwd: string) => {
        if (pwd.length < 6) return { strength: 'weak', label: 'Te kort (minimaal 6 tekens)', color: 'text-red-600' };
        if (pwd.length < 10) return { strength: 'medium', label: 'Gemiddelde sterkte', color: 'text-yellow-600' };
        return { strength: 'strong', label: 'Sterk wachtwoord', color: 'text-green-600' };
    };

    const passwordStrength = getPasswordStrength(password);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await register(name, email, password, role);
            navigate('/workflows');
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : t('auth.registrationFailed');
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
            <div className="max-w-md w-full">
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                            <UserPlus className="w-8 h-8 text-blue-600" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900">{t('auth.createAccount')}</h1>
                        <p className="text-gray-500 mt-2">{t('auth.joinBeleidsscan')}</p>
                    </div>

                    {error && (
                        <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-800">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                                {t('auth.fullName')}
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    autoComplete="name"
                                    data-testid="register-name-input"
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="John Doe"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                                {t('auth.emailAddress')}
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                {t('auth.password')}
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="••••••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded p-1"
                                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                                    title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-5 h-5" />
                                    ) : (
                                        <Eye className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                            {password && (
                                <div className="mt-2 flex items-center gap-2">
                                    {passwordStrength.strength === 'strong' ? (
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                                    )}
                                    <span className={`text-sm ${passwordStrength.color}`}>
                                        {passwordStrength.label}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
                                {t('auth.role')}
                            </label>
                            <div className="relative">
                                <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <select
                                    id="role"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    required
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                                >
                                    <option value="advisor">{t('auth.role.advisor')}</option>
                                    <option value="developer">{t('auth.role.developer')}</option>
                                </select>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading || password.length < 6}
                            isLoading={isLoading}
                            loadingText={t('auth.creatingAccount')}
                            className="w-full h-12 text-base"
                        >
                            {t('auth.createAccount')}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-600">
                            {t('auth.alreadyHaveAccount')}{' '}
                            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                                {t('auth.signIn')}
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
