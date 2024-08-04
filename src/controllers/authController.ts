import { Request, Response } from 'express';
import { User } from '../entities/User';
import bcrypt from 'bcrypt';
import { RoleType } from '../entities/enums/RoleType';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import AppDataSource from '../database/data-source';

export class AuthController {
    // 이메일 인증을 통한 회원가입
    static register = async (req: Request, res: Response) => {
        const { name, email } = req.body;

        try {
            const userRepository = AppDataSource.getRepository(User);

            // 이메일 존재 여부 확인
            const findUser = await userRepository.findOne({ where: { email } });

            if (findUser) {
                // 가입되지 않은 이메일인 경우
                if (findUser.emailToken && findUser.emailTokenExpiry) {
                    const currentTime = new Date();

                    if (currentTime < findUser.emailTokenExpiry) {
                        // 이메일 인증 토큰이 만료되지 않은 경우
                        return res.status(400).json({ message: '이메일 인증을 완료해주세요.' });
                    } else {
                        // 이메일 인증 토큰이 만료된 경우
                        await userRepository.remove(findUser);
                    }
                } else {
                    // 이미 가입된 이메일인 경우
                    return res.status(400).json({ message: '이미 가입된 이메일입니다.' });
                }
            }

            // 이메일 인증 토큰 및 만료시간 설정
            const emailToken = crypto.randomBytes(32).toString('hex');
            const emailTokenExpiry = new Date();
            emailTokenExpiry.setHours(emailTokenExpiry.getHours() + 1);

            // 비밀번호 재설정 토큰 및 만료기간 저장
            const user = userRepository.create({
                name,
                email,
                password: '',
                role: RoleType.STUDENT,
                emailToken: emailToken,
                emailTokenExpiry,
            });

            await userRepository.save(user);

            // 이메일 전송
            const transporter = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: '이메일 인증',
                text: `이메일 인증을 위해 다음 링크를 클릭하세요: \n\n ${process.env.URL}/users/verify/${emailToken}`,
            };

            await transporter.sendMail(mailOptions);

            res.status(200).json({ message: '이메일로 인증 링크가 전송되었습니다.' });
        } catch (error) {
            console.log(error);
            res.status(500).json({ message: '서버 오류가 발생했습니다.' });
        }
    };

    // 이메일 인증 및 비밀번호 설정
    static verifyEmail = async (req: Request, res: Response) => {
        const { emailToken, password } = req.body;

        try {
            const userRepository = AppDataSource.getRepository(User);

            // 유효한 이메일 인증 토큰인지 확인
            const user = await userRepository.findOne({ where: { emailToken: emailToken } });
            if (!user) {
                return res.status(400).json({ message: '유효하지 않은 이메일 인증 토큰입니다.' });
            }

            // 만료된 이메일 인증 토큰인지 확인
            const currentTime = new Date();
            if (user.emailTokenExpiry && currentTime > user.emailTokenExpiry) {
                return res.status(400).json({ message: '이메일 인증 토큰이 만료되었습니다.' });
            }

            // 비밀번호 설정
            const hashedPassword = await bcrypt.hash(password, 10);

            user.password = hashedPassword;
            user.emailToken = null;
            user.emailTokenExpiry = null;

            await userRepository.save(user);

            res.status(200).json({ message: '회원가입이 완료되었습니다.' });
        } catch (error) {
            console.log(error);
            res.status(500).json({ message: '서버 오류가 발생했습니다.' });
        }
    };

    // 로그인
    static login = async (req: Request, res: Response) => {
        const { email, password } = req.body;

        try {
            const userRepository = AppDataSource.getRepository(User);

            // 이메일 일치 여부 확인
            const user = await userRepository.findOne({ where: { email } });
            if (!user) {
                return res.status(400).json({ message: '사용자를 찾을 수 없습니다.' });
            }

            const currentTime = new Date();

            // 이메일 인증 여부 확인
            if (user.emailTokenExpiry && currentTime < user.emailTokenExpiry) {
                return res.status(400).json({ message: '이메일 인증을 먼저 완료해주세요.' });
            }

            // 만료된 이메일 인증 토큰을 가진 이메일인지 확인
            if (user.emailTokenExpiry && currentTime > user.emailTokenExpiry) {
                return res.status(400).json({ message: '이메일 인증이 만료되었습니다. 다시 회원가입 해주세요.' });
            }

            // 비밀번호 일치 여부 확인
            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                return res.status(400).json({ message: '비밀번호가 틀렸습니다.' });
            }

            // 이미 로그인한 사용자인지 확인
            if (user.refreshToken) {
                return res.status(400).json({ message: '이미 로그인된 상태입니다.' });
            }

            const accessToken = generateAccessToken(user.id);
            const refreshToken = generateRefreshToken(user.id);

            user.refreshToken = refreshToken;
            await userRepository.save(user);

            res.status(200).json({ message: '로그인에 성공하였습니다.', accessToken, refreshToken });
        } catch (error) {
            res.status(500).json({ message: '서버 오류가 발생했습니다.' });
        }
    };

    // 비밀번호 찾기
    static findPassword = async (req: Request, res: Response) => {
        const { name, email } = req.body;

        try {
            const userRepository = AppDataSource.getRepository(User);

            // 이름과 이메일이 일치하는 사용자 찾기
            const user = await userRepository.findOne({ where: { name, email } });
            if (!user) {
                return res.status(400).json({ message: '사용자를 찾을 수 없습니다.' });
            }

            // 비밀번호 재설정 토큰 및 만료시간 설정
            const resetPasswordToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpiry = new Date();
            resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

            // 비밀번호 재설정 토큰 및 만료기간 저장
            user.resetPasswordToken = resetPasswordToken;
            user.resetPasswordExpiry = resetTokenExpiry;

            await userRepository.save(user);

            // 이메일 전송
            const transporter = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: '비밀번호 재설정',
                text: `비밀번호 재설정을 위해 다음 링크를 클릭하세요: \n\n ${process.env.URL}/reset-password/${resetPasswordToken}`,
            };

            await transporter.sendMail(mailOptions);

            res.status(200).json({ message: '비밀번호 재설정 링크가 이메일로 전송되었습니다.' });
        } catch (error) {
            console.log(error);
            res.status(500).json({ message: '서버 오류가 발생했습니다.' });
        }
    };

    // 비밀번호 재설정
    static resetPassword = async (req: Request, res: Response) => {
        const { resetPasswordToken, newPassword } = req.body;

        try {
            const userRepository = AppDataSource.getRepository(User);

            // 유효한 재설정 토큰인지 확인
            const user = await userRepository.findOne({ where: { resetPasswordToken: resetPasswordToken } });
            if (!user) {
                return res.status(400).json({ message: '유효하지 않은 비밀번호 재설정 토큰입니다.' });
            }

            // 토큰 만료 여부 확인
            const currentTime = new Date();
            if (user.resetPasswordExpiry && currentTime > user.resetPasswordExpiry) {
                return res.status(400).json({ message: '비밀번호 재설정 토큰이 만료되었습니다.' });
            }

            // 새 비밀번호 설정
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            user.password = hashedPassword;
            user.resetPasswordToken = null;
            user.resetPasswordExpiry = null;

            await userRepository.save(user);

            res.status(200).json({ message: '비밀번호가 성공적으로 재설정되었습니다.' });
        } catch (error) {
            console.log(error);
            res.status(500).json({ message: '서버 오류가 발생했습니다.' });
        }
    };
}
